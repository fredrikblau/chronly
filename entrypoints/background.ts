import { browser } from 'wxt/browser'
import { isAlertActionMessage } from '../lib/core/alerts'
import { playAlarmSound, stopAlarmSound } from '../lib/core/audio'
import {
  buildNotificationSpec,
  NOTIFICATION_ACTIONS,
  notificationIdFor,
  parseNotificationId,
  showNotification,
  type AlertAction,
} from '../lib/core/notifications'
import {
  computeDueRecords,
  effectiveDueTime,
  isDue,
  pauseRecord,
  reconcileFiredRecord,
  snoozeAlarm,
} from '../lib/core/scheduler'
import {
  ACTIVE_ALERTS_KEY,
  ActiveAlertStore,
  createExtensionStorageBackend,
  CustomSoundStore,
  PomodoroStatsStore,
  RecordStore,
} from '../lib/core/storage'
import type { ActiveAlert, SchedulableRecord } from '../lib/core/types'

export const TICK_ALARM_NAME = 'tick'
export const TICK_PERIOD_MINUTES = 0.5
const RECORD_ALARM_PREFIX = 'record:'

export function observeBackgroundTask(task: Promise<unknown>, failure: string, ...context: unknown[]): void {
  void task.catch((error: unknown) => {
    console.warn(`[chronly] ${failure}`, ...context, error)
  })
}

function recordAlarmName(id: string): string {
  return `${RECORD_ALARM_PREFIX}${id}`
}

function alertStore(): ActiveAlertStore {
  return new ActiveAlertStore(createExtensionStorageBackend('session'))
}

/** Switched off since the last write — a ringing alarm stops when it is. */
function wasSwitchedOff(before: SchedulableRecord, after: SchedulableRecord | undefined): boolean {
  return before.kind === 'alarm' && after?.kind === 'alarm' && before.enabled !== false && after.enabled === false
}

/**
 * Release everything a record held: its scheduled wake-up, its notification,
 * its sound, and its place in the ringing list. Runs for records that were
 * deleted and for alarms that were switched off.
 */
export async function cleanupRemovedRecords(
  oldRecords: Record<string, SchedulableRecord> = {},
  newRecords: Record<string, SchedulableRecord> = {},
): Promise<void> {
  const alerts = alertStore()
  await Promise.all(
    Object.values(oldRecords)
      .filter((record) => !newRecords[record.id] || wasSwitchedOff(record, newRecords[record.id]))
      .map((record) =>
        Promise.all([
          browser.alarms.clear(recordAlarmName(record.id)),
          browser.notifications.clear(buildNotificationSpec(record).notificationId),
          stopAlarmSound(record.id),
          alerts.remove(record.id),
        ]),
      ),
  )
}

function needsWakeUp(record: SchedulableRecord): boolean {
  if (record.notified) return false
  return record.kind === 'alarm' ? record.enabled !== false : record.status === 'running'
}

async function scheduleRecords(records: SchedulableRecord[], now: number): Promise<void> {
  for (const record of records) {
    const name = recordAlarmName(record.id)
    // A paused timer, a switched-off alarm, or one that has rung has nothing to
    // wake for; dropping its wake-up saves the worker a pointless start.
    if (!needsWakeUp(record)) {
      await browser.alarms.clear(name)
      continue
    }
    const when = effectiveDueTime(record)
    if (when <= now) continue
    const existing = await browser.alarms.get(name)
    if (!existing || existing.scheduledTime !== when) {
      await browser.alarms.create(name, { when })
    }
  }
}

export async function ensureTickAlarm(): Promise<void> {
  const existing = await browser.alarms.get(TICK_ALARM_NAME)
  // Recreate an alarm left behind at a different period by an older version,
  // otherwise it would keep ticking at the stale rate forever.
  if (existing?.periodInMinutes === TICK_PERIOD_MINUTES) return
  await browser.alarms.create(TICK_ALARM_NAME, { periodInMinutes: TICK_PERIOD_MINUTES })
}

/**
 * The notification is awaited; the sound deliberately is not. Audio is the
 * redundant half of the firing path — on Firefox it runs a real AudioContext
 * in this same context, which can reject or never settle, and awaiting it
 * would stall every remaining due record behind it.
 *
 * The ringing entry is written before the notification so the popup can still
 * silence the sound when the notification itself is blocked or fails.
 */
async function fireRecord(record: SchedulableRecord, now: number): Promise<void> {
  const customSound = await new CustomSoundStore(createExtensionStorageBackend('local')).getAll()
  const imported = customSound.find((sound) => sound.id === record.soundId)
  observeBackgroundTask(
    playAlarmSound(record.soundId, record.volume, record.id, true, imported?.dataUrl),
    'could not play the alarm sound',
    record.id,
  )
  const spec = buildNotificationSpec(record)
  observeBackgroundTask(
    alertStore().add({
      recordId: record.id,
      kind: record.kind,
      notificationId: spec.notificationId,
      title: spec.options.title,
      message: spec.options.message,
      firedAt: now,
    }),
    'could not record the ringing alert',
    record.id,
  )
  await showNotification(spec)
}

export async function reconcileDueRecords(store: RecordStore, now: number): Promise<void> {
  const statsStore = new PomodoroStatsStore(createExtensionStorageBackend('local'))
  const records = await store.getAll()
  await scheduleRecords(records, now)
  const due = computeDueRecords(records, now)
  for (const record of due) {
    try {
      await fireRecord(record, now)
      // Advance the record before counting the session. If the worker dies
      // between the two writes this under-counts by one rather than leaving
      // the record due, re-firing it next tick and counting it twice.
      const replaced = await store.replaceIfCurrent(reconcileFiredRecord(record, now), record.updatedAt)
      if (replaced && record.kind === 'pomodoro' && record.phase === 'focus') {
        await statsStore.recordCompletedFocusSession(record.config.focusMs, now)
      }
    } catch (error) {
      // One bad record must not strand the rest of this tick.
      console.warn('[chronly] could not fire record', record.id, error)
    }
  }
}

export function extractRecordId(notificationId: string): string {
  return parseNotificationId(notificationId)?.recordId ?? notificationId
}

/** Records that exist only until they are acknowledged. A one-off alarm is not
 *  one of them: it switches itself off and stays listed, like a phone's. */
function isTransient(record: SchedulableRecord): boolean {
  return record.kind === 'countdown' && record.status === 'completed'
}

/**
 * Act on a ringing alert. Notification buttons and the popup's ringing banner
 * both land here. Whatever the action, the alert is silenced and cleared even
 * when the record write fails, so a storage error can never leave a sound
 * looping with nothing left to stop it.
 */
export async function handleAlertAction(
  store: RecordStore,
  recordId: string,
  action: AlertAction,
  now: number,
  notificationId?: string,
): Promise<void> {
  const alerts = alertStore()
  const [record, alert] = await Promise.all([store.get(recordId), alerts.get(recordId).catch(() => undefined)])

  try {
    if (record?.kind === 'alarm' && action === 'snooze') {
      await store.upsert(snoozeAlarm(record, now))
    } else if (record?.kind === 'pomodoro' && action === 'pause') {
      // Pause the phase that already auto-started.
      await store.upsert(pauseRecord(record, now))
    } else if (record && isTransient(record)) {
      await store.remove(record.id)
    } else if (record && isDue(record, now)) {
      // Its notification failed, so the tick never advanced it; acknowledging
      // it has to, or it would ring again on the very next tick.
      await store.upsert(reconcileFiredRecord(record, now))
    }
  } finally {
    void stopAlarmSound(recordId)
    observeBackgroundTask(alerts.remove(recordId), 'could not clear the ringing alert', recordId)
    // A Test preview has no record and never rang, so the notification that was
    // clicked is the only id there is.
    const toClear = notificationId ?? (record ? notificationIdFor(record.kind, recordId) : alert?.notificationId)
    if (toClear) await browser.notifications.clear(toClear)
  }
}

export async function handleNotificationButton(
  store: RecordStore,
  notificationId: string,
  buttonIndex: number,
  now: number,
): Promise<void> {
  const parsed = parseNotificationId(notificationId)
  if (!parsed) return
  const action = NOTIFICATION_ACTIONS[parsed.kind][buttonIndex] ?? 'dismiss'
  await handleAlertAction(store, parsed.recordId, action, now, notificationId)
}

/**
 * Closing a notification acknowledges it. This is also the only dismissal path
 * on Firefox, which supports no notification buttons — clicking the body there
 * closes the notification and lands here.
 */
export async function handleNotificationClosed(store: RecordStore, notificationId: string): Promise<void> {
  const record = await store.get(extractRecordId(notificationId))
  // The notification may already have advanced a recurring alarm or a
  // Pomodoro into its next state, so `notified` is not a reliable playback
  // guard here. The notification id is the playback id; stopping an inactive
  // key is harmless and guarantees every close path silences the ring.
  const recordId = record?.id ?? extractRecordId(notificationId)
  void stopAlarmSound(recordId)
  observeBackgroundTask(alertStore().remove(recordId), 'could not clear the ringing alert', recordId)
  // `notified` is the guard that makes this safe to call from the snooze path:
  // snoozing clears it and then clears the notification, which fires onClosed.
  // Without this check that close would delete the alarm the user just snoozed.
  if (record?.notified && isTransient(record)) await store.remove(record.id)
}

/**
 * The toolbar badge marks a ringing alert, so a sound with no visible
 * notification still points at where to stop it. The action API is missing in
 * some test and preview environments; the badge is a hint, never load-bearing.
 */
export async function syncAlertBadge(alerts: ActiveAlert[]): Promise<void> {
  const action = browser.action
  if (!action?.setBadgeText) return
  const [first] = alerts
  await action.setBadgeText({ text: first ? '!' : '' })
  if (first) await action.setBadgeBackgroundColor({ color: '#e5484d' })
  await action.setTitle({
    title: first
      ? `Chronly — ${first.title} is ringing${alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ''}`
      : 'Chronly',
  })
}

export default defineBackground(() => {
  const store = new RecordStore(createExtensionStorageBackend('local'))

  // The tick alarm comes first and unconditionally. Everything below is a
  // listener registration, and a throw in any one of them would abort this
  // function and silently orphan every registration after it — including this
  // one, which is what keeps alarms firing at all.
  observeBackgroundTask(ensureTickAlarm(), 'could not ensure the tick alarm')

  // Every listener is registered synchronously at the top level: a worker woken
  // specifically to deliver one of these events would otherwise miss it.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== TICK_ALARM_NAME && !alarm.name.startsWith(RECORD_ALARM_PREFIX)) return
    observeBackgroundTask(reconcileDueRecords(store, Date.now()), 'could not reconcile scheduled records', alarm.name)
  })

  // Firefox has no notification buttons and does not define this event at all;
  // touching it there throws. Its dismissal path is onClosed instead.
  if (browser.notifications.onButtonClicked) {
    browser.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      observeBackgroundTask(
        handleNotificationButton(store, notificationId, buttonIndex, Date.now()),
        'could not handle notification button',
        notificationId,
      )
    })
  }

  if (browser.notifications.onClicked) {
    // Clicking the body acknowledges the notification. Clearing it routes
    // through onClosed, which owns the cleanup.
    browser.notifications.onClicked.addListener((notificationId) => {
      observeBackgroundTask(
        browser.notifications.clear(notificationId),
        'could not clear clicked notification',
        notificationId,
      )
    })
  }

  browser.notifications.onClosed.addListener((notificationId) => {
    observeBackgroundTask(
      handleNotificationClosed(store, notificationId),
      'could not handle notification close',
      notificationId,
    )
  })

  browser.runtime.onInstalled.addListener(() => {
    observeBackgroundTask(ensureTickAlarm(), 'could not ensure the tick alarm after install')
  })

  browser.runtime.onStartup.addListener(() => {
    observeBackgroundTask(ensureTickAlarm(), 'could not ensure the tick alarm after startup')
    // A browser restart silences every sound. Session storage already forgets
    // the ringing list; this covers browsers where it fell back to local.
    observeBackgroundTask(alertStore().clear(), 'could not clear stale ringing alerts')
  })

  // The popup's ringing banner. Replying keeps the popup's sendMessage promise
  // pending until the action is done, so it can report a failure.
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (ok: boolean) => void) => {
    if (!isAlertActionMessage(message)) return
    handleAlertAction(store, message.recordId, message.action, Date.now()).then(
      () => sendResponse(true),
      (error: unknown) => {
        console.warn('[chronly] could not handle alert action', message.recordId, error)
        sendResponse(false)
      },
    )
    return true
  })

  // Schedule a newly-created or edited record immediately instead of waiting
  // for the coarse reconciliation tick to discover it.
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (changes[ACTIVE_ALERTS_KEY]) {
      const alerts = Object.values((changes[ACTIVE_ALERTS_KEY].newValue ?? {}) as Record<string, ActiveAlert>)
      observeBackgroundTask(syncAlertBadge(alerts), 'could not update the toolbar badge')
    }
    if (areaName !== 'local' || !changes.records) return
    observeBackgroundTask(
      cleanupRemovedRecords(
        changes.records.oldValue as Record<string, SchedulableRecord> | undefined,
        changes.records.newValue as Record<string, SchedulableRecord> | undefined,
      ),
      'could not clean up removed records',
    )
    observeBackgroundTask(reconcileDueRecords(store, Date.now()), 'could not reconcile changed records')
  })
})
