import { browser } from 'wxt/browser'
import { playAlarmSound, stopAlarmSound } from '../lib/core/audio'
import { buildNotificationSpec, showNotification } from '../lib/core/notifications'
import {
  computeDueRecords,
  effectiveDueTime,
  pauseRecord,
  reconcileFiredRecord,
  snoozeAlarm,
} from '../lib/core/scheduler'
import { createExtensionStorageBackend, PomodoroStatsStore, CustomSoundStore, RecordStore } from '../lib/core/storage'
import type { SchedulableRecord } from '../lib/core/types'

export const TICK_ALARM_NAME = 'tick'
export const TICK_PERIOD_MINUTES = 0.5
const RECORD_ALARM_PREFIX = 'record:'

function recordAlarmName(id: string): string {
  return `${RECORD_ALARM_PREFIX}${id}`
}

export async function cleanupRemovedRecords(
  oldRecords: Record<string, SchedulableRecord> = {},
  newRecords: Record<string, SchedulableRecord> = {},
): Promise<void> {
  await Promise.all(
    Object.values(oldRecords)
      .filter((record) => !newRecords[record.id])
      .map((record) =>
        Promise.all([
          browser.alarms.clear(recordAlarmName(record.id)),
          browser.notifications.clear(buildNotificationSpec(record).notificationId),
          stopAlarmSound(record.id),
        ]),
      ),
  )
}

async function scheduleRecords(records: SchedulableRecord[], now: number): Promise<void> {
  for (const record of records) {
    if (record.notified || (record.kind !== 'alarm' && record.status !== 'running')) continue
    const when = effectiveDueTime(record)
    if (when <= now) continue
    const existing = await browser.alarms.get(recordAlarmName(record.id))
    if (!existing || existing.scheduledTime !== when) {
      await browser.alarms.create(recordAlarmName(record.id), { when })
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
 */
async function fireRecord(record: SchedulableRecord): Promise<void> {
  const customSound = await new CustomSoundStore(createExtensionStorageBackend('local')).getAll()
  const imported = customSound.find((sound) => sound.id === record.soundId)
  void playAlarmSound(record.soundId, record.volume, record.id, true, imported?.dataUrl).catch((error: unknown) => {
    console.warn('[chronly] could not play the alarm sound', error)
  })
  await showNotification(buildNotificationSpec(record))
}

export async function reconcileDueRecords(store: RecordStore, now: number): Promise<void> {
  const statsStore = new PomodoroStatsStore(createExtensionStorageBackend('local'))
  const records = await store.getAll()
  await scheduleRecords(records, now)
  const due = computeDueRecords(records, now)
  for (const record of due) {
    try {
      await fireRecord(record)
      // Advance the record before counting the session. If the worker dies
      // between the two writes this under-counts by one rather than leaving
      // the record due, re-firing it next tick and counting it twice.
      const replaced = await store.replaceIfCurrent(reconcileFiredRecord(record, now), record.updatedAt)
      if (replaced && record.kind === 'pomodoro' && record.phase === 'focus') {
        await statsStore.recordCompletedFocusSession(record.config.focusMs)
      }
    } catch (error) {
      // One bad record must not strand the rest of this tick.
      console.warn('[chronly] could not fire record', record.id, error)
    }
  }
}

export function extractRecordId(notificationId: string): string {
  return notificationId.replace(/^chronly-(alarm|countdown|pomodoro)-/, '')
}

/** Records that exist only until they are acknowledged, as opposed to a
 *  recurring alarm or a pomodoro that rolls into its next phase. */
function isTransient(record: SchedulableRecord): boolean {
  return (
    (record.kind === 'alarm' && record.recurrence === null) ||
    (record.kind === 'countdown' && record.status === 'completed')
  )
}

export async function handleNotificationButton(
  store: RecordStore,
  notificationId: string,
  buttonIndex: number,
  now: number,
): Promise<void> {
  const record = await store.get(extractRecordId(notificationId))
  if (!record) return

  if (record.kind === 'alarm' && buttonIndex === 0) {
    await store.upsert(snoozeAlarm(record, now))
    void stopAlarmSound(record.id)
    await browser.notifications.clear(notificationId)
    return
  }

  if (record.kind === 'pomodoro' && buttonIndex === 0) {
    // Pause the phase that already auto-started.
    await store.upsert(pauseRecord(record, now))
    void stopAlarmSound(record.id)
    await browser.notifications.clear(notificationId)
    return
  }

  if (isTransient(record)) await store.remove(record.id)
  void stopAlarmSound(record.id)
  await browser.notifications.clear(notificationId)
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
  void stopAlarmSound(record?.id ?? extractRecordId(notificationId))
  // `notified` is the guard that makes this safe to call from the snooze path:
  // snoozing clears it and then clears the notification, which fires onClosed.
  // Without this check that close would delete the alarm the user just snoozed.
  if (record?.notified && isTransient(record)) await store.remove(record.id)
}

export default defineBackground(() => {
  const store = new RecordStore(createExtensionStorageBackend('local'))

  // The tick alarm comes first and unconditionally. Everything below is a
  // listener registration, and a throw in any one of them would abort this
  // function and silently orphan every registration after it — including this
  // one, which is what keeps alarms firing at all.
  void ensureTickAlarm()

  // Every listener is registered synchronously at the top level: a worker woken
  // specifically to deliver one of these events would otherwise miss it.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== TICK_ALARM_NAME && !alarm.name.startsWith(RECORD_ALARM_PREFIX)) return
    void reconcileDueRecords(store, Date.now())
  })

  // Firefox has no notification buttons and does not define this event at all;
  // touching it there throws. Its dismissal path is onClosed instead.
  if (browser.notifications.onButtonClicked) {
    browser.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      void handleNotificationButton(store, notificationId, buttonIndex, Date.now())
    })
  }

  if (browser.notifications.onClicked) {
    // Clicking the body acknowledges the notification. Clearing it routes
    // through onClosed, which owns the cleanup.
    browser.notifications.onClicked.addListener((notificationId) => {
      void browser.notifications.clear(notificationId)
    })
  }

  browser.notifications.onClosed.addListener((notificationId) => {
    void handleNotificationClosed(store, notificationId)
  })

  browser.runtime.onInstalled.addListener(() => {
    void ensureTickAlarm()
  })

  browser.runtime.onStartup.addListener(() => {
    void ensureTickAlarm()
  })

  // Schedule a newly-created or edited record immediately instead of waiting
  // for the coarse reconciliation tick to discover it.
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.records) return
    void cleanupRemovedRecords(
      changes.records.oldValue as Record<string, SchedulableRecord> | undefined,
      changes.records.newValue as Record<string, SchedulableRecord> | undefined,
    )
    void reconcileDueRecords(store, Date.now())
  })
})
