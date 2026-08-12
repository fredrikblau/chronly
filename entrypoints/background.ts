import { browser } from 'wxt/browser'
import { playAlarmSound } from '../lib/core/audio'
import { buildNotificationSpec, showNotification } from '../lib/core/notifications'
import {
  computeDueRecords,
  pauseRecord,
  reconcileFiredRecord,
  snoozeAlarm,
} from '../lib/core/scheduler'
import {
  createExtensionStorageBackend,
  PomodoroStatsStore,
  RecordStore,
} from '../lib/core/storage'
import type { SchedulableRecord } from '../lib/core/types'

export const TICK_ALARM_NAME = 'tick'
export const TICK_PERIOD_MINUTES = 0.5

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
  await showNotification(buildNotificationSpec(record))
  void playAlarmSound(record.soundId, record.volume).catch((error: unknown) => {
    console.warn('[chronly] could not play the alarm sound', error)
  })
}

export async function reconcileDueRecords(store: RecordStore, now: number): Promise<void> {
  const statsStore = new PomodoroStatsStore(createExtensionStorageBackend('local'))
  const due = computeDueRecords(await store.getAll(), now)
  for (const record of due) {
    try {
      await fireRecord(record)
      // Advance the record before counting the session. If the worker dies
      // between the two writes this under-counts by one rather than leaving
      // the record due, re-firing it next tick and counting it twice.
      await store.upsert(reconcileFiredRecord(record, now))
      if (record.kind === 'pomodoro' && record.phase === 'focus') {
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
    await browser.notifications.clear(notificationId)
    return
  }

  if (record.kind === 'pomodoro' && buttonIndex === 0) {
    // Pause the phase that already auto-started.
    await store.upsert(pauseRecord(record, now))
    await browser.notifications.clear(notificationId)
    return
  }

  if (isTransient(record)) await store.remove(record.id)
  await browser.notifications.clear(notificationId)
}

/**
 * Closing a notification acknowledges it. This is also the only dismissal path
 * on Firefox, which supports no notification buttons — clicking the body there
 * closes the notification and lands here.
 */
export async function handleNotificationClosed(
  store: RecordStore,
  notificationId: string,
): Promise<void> {
  const record = await store.get(extractRecordId(notificationId))
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
    if (alarm.name !== TICK_ALARM_NAME) return
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
})
