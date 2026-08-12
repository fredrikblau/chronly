import { browser } from 'wxt/browser'
import { playAlarmSound } from '../lib/core/audio'
import { buildNotificationSpec, showNotification } from '../lib/core/notifications'
import { computeDueRecords, pauseRecord, reconcileFiredRecord } from '../lib/core/scheduler'
import {
  createExtensionStorageBackend,
  PomodoroStatsStore,
  RecordStore,
} from '../lib/core/storage'
import type { SchedulableRecord } from '../lib/core/types'

export const TICK_ALARM_NAME = 'tick'
export const TICK_PERIOD_MINUTES = 0.5

const SNOOZE_MS = 5 * 60_000

export async function ensureTickAlarm(): Promise<void> {
  const existing = await browser.alarms.get(TICK_ALARM_NAME)
  if (existing) return
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
    await fireRecord(record)
    if (record.kind === 'pomodoro' && record.phase === 'focus') {
      await statsStore.recordCompletedFocusSession(record.config.focusMs)
    }
    await store.upsert(reconcileFiredRecord(record, now))
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
    await store.upsert({
      ...record,
      targetTimestamp: now + SNOOZE_MS,
      notified: false,
      updatedAt: now,
    })
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
  if (record && isTransient(record)) await store.remove(record.id)
}

export default defineBackground(() => {
  const store = new RecordStore(createExtensionStorageBackend('local'))

  // Every listener is registered synchronously at the top level: a worker woken
  // specifically to deliver one of these events would otherwise miss it.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== TICK_ALARM_NAME) return
    void reconcileDueRecords(store, Date.now())
  })

  browser.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    void handleNotificationButton(store, notificationId, buttonIndex, Date.now())
  })

  browser.notifications.onClosed.addListener((notificationId) => {
    void handleNotificationClosed(store, notificationId)
  })

  browser.runtime.onInstalled.addListener(() => {
    void ensureTickAlarm()
  })

  browser.runtime.onStartup.addListener(() => {
    void ensureTickAlarm()
  })

  // Covers a worker restarting mid-session without a fresh onInstalled/onStartup.
  void ensureTickAlarm()
})
