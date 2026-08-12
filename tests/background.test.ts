import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAlarm, createCountdown, createPomodoro } from '../lib/core/scheduler'
import {
  createExtensionStorageBackend,
  PomodoroStatsStore,
  RecordStore,
} from '../lib/core/storage'
import {
  ensureTickAlarm,
  extractRecordId,
  handleNotificationButton,
  handleNotificationClosed,
  reconcileDueRecords,
  TICK_ALARM_NAME,
  TICK_PERIOD_MINUTES,
} from '../entrypoints/background'

const NOW = 1_770_000_000_000

function newStore(): RecordStore {
  return new RecordStore(createExtensionStorageBackend('local'))
}

describe('ensureTickAlarm', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('creates the tick alarm if none exists', async () => {
    await ensureTickAlarm()
    const alarm = await fakeBrowser.alarms.get(TICK_ALARM_NAME)
    expect(alarm?.periodInMinutes).toBe(TICK_PERIOD_MINUTES)
  })

  it('does not recreate the tick alarm if it already exists', async () => {
    await ensureTickAlarm()
    const createSpy = vi.spyOn(fakeBrowser.alarms, 'create')
    await ensureTickAlarm()
    expect(createSpy).not.toHaveBeenCalled()
  })
})

describe('reconcileDueRecords', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('fires a notification for a due alarm and keeps it notified in storage', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)

    await reconcileDueRecords(store, NOW + 1)

    const notifications = await fakeBrowser.notifications.getAll()
    expect(Object.keys(notifications)).toContain(`chronly-alarm-${alarm.id}`)
    const updated = await store.get(alarm.id)
    expect(updated?.notified).toBe(true)
  })

  it('does not re-fire an already-notified record on a later tick (idempotent catch-up)', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    const createSpy = vi.spyOn(fakeBrowser.notifications, 'create')
    await reconcileDueRecords(store, NOW + 60_000) // a later tick, e.g. after a delayed wake

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('leaves a not-yet-due countdown untouched', async () => {
    const store = newStore()
    await store.upsert(createCountdown('Tea', 5 * 60_000, NOW))

    await reconcileDueRecords(store, NOW + 1000)

    expect(Object.keys(await fakeBrowser.notifications.getAll())).toHaveLength(0)
  })

  it('still notifies every due record when one record’s sound fails', async () => {
    const store = newStore()
    const first = createAlarm('First', NOW, NOW)
    const second = createAlarm('Second', NOW, NOW)
    await store.upsert(first)
    await store.upsert(second)
    // Audio is the redundant half of the firing path; a failure in it must not
    // cost any notification, including for records later in the same tick.
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await reconcileDueRecords(store, NOW + 1)

    const ids = Object.keys(await fakeBrowser.notifications.getAll())
    expect(ids).toContain(`chronly-alarm-${first.id}`)
    expect(ids).toContain(`chronly-alarm-${second.id}`)
  })
})

describe('handleNotificationButton', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('snoozes a fired one-off alarm by 5 minutes', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1) // fire it first, as the tick handler would

    await handleNotificationButton(store, `chronly-alarm-${alarm.id}`, 0, NOW + 5000)

    const updated = await store.get(alarm.id)
    expect(updated?.notified).toBe(false)
    expect(updated?.kind === 'alarm' && updated.targetTimestamp).toBe(NOW + 5000 + 5 * 60_000)
  })

  it('removes a dismissed one-off alarm entirely', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleNotificationButton(store, `chronly-alarm-${alarm.id}`, 1, NOW + 5000) // Dismiss

    expect(await store.get(alarm.id)).toBeUndefined()
  })

  it('ignores a notification whose record is already gone', async () => {
    const store = newStore()
    await expect(
      handleNotificationButton(store, 'chronly-alarm-missing', 0, NOW),
    ).resolves.toBeUndefined()
  })
})

describe('handleNotificationClosed', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('removes a completed countdown when its notification is closed', async () => {
    const store = newStore()
    const countdown = createCountdown('Tea', 1000, NOW)
    await store.upsert(countdown)
    await reconcileDueRecords(store, NOW + 1000)

    await handleNotificationClosed(store, `chronly-countdown-${countdown.id}`)

    expect(await store.get(countdown.id)).toBeUndefined()
  })

  it('keeps a recurring alarm when its notification is closed', async () => {
    const store = newStore()
    const alarm = createAlarm('Standup', NOW, NOW, { days: [1, 2, 3, 4, 5] })
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleNotificationClosed(store, `chronly-alarm-${alarm.id}`)

    expect(await store.get(alarm.id)).toBeDefined()
  })
})

describe('extractRecordId', () => {
  it('strips the kind-specific notification prefix', () => {
    expect(extractRecordId('chronly-alarm-alarm-123-1')).toBe('alarm-123-1')
    expect(extractRecordId('chronly-countdown-countdown-9')).toBe('countdown-9')
  })
})

describe('reconcileDueRecords pomodoro stats', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  const config = { focusMs: 1000, shortBreakMs: 500, longBreakMs: 2000, cyclesBeforeLongBreak: 4 }

  it('records a completed focus session when a pomodoro finishes its focus phase', async () => {
    const store = newStore()
    await store.upsert(createPomodoro('Deep work', config, NOW))

    await reconcileDueRecords(store, NOW + 1000)

    const statsStore = new PomodoroStatsStore(createExtensionStorageBackend('local'))
    expect(await statsStore.get()).toEqual({
      totalFocusSessionsCompleted: 1,
      totalFocusMs: 1000,
    })
  })

  it('does not record a session when a break phase finishes', async () => {
    const store = newStore()
    await store.upsert(createPomodoro('Deep work', config, NOW))
    await reconcileDueRecords(store, NOW + 1000) // focus -> shortBreak

    await reconcileDueRecords(store, NOW + 1500) // shortBreak -> focus

    const statsStore = new PomodoroStatsStore(createExtensionStorageBackend('local'))
    expect((await statsStore.get()).totalFocusSessionsCompleted).toBe(1)
  })
})
