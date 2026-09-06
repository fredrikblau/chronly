import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playAlarmSound, stopAlarmSound } from '../lib/core/audio'
import { createAlarm, createCountdown, createPomodoro } from '../lib/core/scheduler'
import { createExtensionStorageBackend, PomodoroStatsStore, RecordStore } from '../lib/core/storage'
import {
  cleanupRemovedRecords,
  ensureTickAlarm,
  extractRecordId,
  handleNotificationButton,
  handleNotificationClosed,
  reconcileDueRecords,
  TICK_ALARM_NAME,
  TICK_PERIOD_MINUTES,
} from '../entrypoints/background'

// Audio needs a real AudioContext/offscreen document; the unit under test here
// is the reconciliation loop's handling of it, not playback itself.
vi.mock('../lib/core/audio', () => ({
  playAlarmSound: vi.fn(async () => {}),
  stopAlarmSound: vi.fn(async () => {}),
}))

const NOW = 1_770_000_000_000

function newStore(): RecordStore {
  return new RecordStore(createExtensionStorageBackend('local'))
}

beforeEach(() => {
  vi.mocked(playAlarmSound).mockReset().mockResolvedValue(undefined)
  vi.mocked(stopAlarmSound).mockReset().mockResolvedValue(undefined)
})

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

describe('cleanupRemovedRecords', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('stops every browser resource owned by a deleted record', async () => {
    const countdown = createCountdown('Tea', 60_000, NOW)
    await fakeBrowser.alarms.create(`record:${countdown.id}`, { when: NOW + 60_000 })
    await fakeBrowser.notifications.create(`chronly-countdown-${countdown.id}`, {
      type: 'basic',
      iconUrl: '/icon/128.png',
      title: 'Tea',
      message: 'Time is up.',
    })

    await cleanupRemovedRecords({ [countdown.id]: countdown }, {})

    expect(await fakeBrowser.alarms.get(`record:${countdown.id}`)).toBeUndefined()
    expect(await fakeBrowser.notifications.getAll()).toEqual({})
    expect(stopAlarmSound).toHaveBeenCalledWith(countdown.id)
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

  it('completes the tick even when the sound never finishes playing', async () => {
    // The decisive test for the deliberate non-await: a sound that never
    // settles. Awaiting it would hang this tick forever, and unlike a rejection
    // that outcome cannot be masked by the per-record try/catch.
    vi.mocked(playAlarmSound).mockReturnValue(new Promise<void>(() => {}))
    const store = newStore()
    const first = createAlarm('First', NOW, NOW)
    const second = createAlarm('Second', NOW, NOW)
    await store.upsert(first)
    await store.upsert(second)

    await reconcileDueRecords(store, NOW + 1)

    const ids = Object.keys(await fakeBrowser.notifications.getAll())
    expect(ids).toContain(`chronly-alarm-${first.id}`)
    expect(ids).toContain(`chronly-alarm-${second.id}`)
  }, 2000)

  it('marks a record fired even when its sound rejects', async () => {
    // Awaiting the sound would throw before the record was advanced, leaving it
    // due and re-firing it on the next tick.
    vi.mocked(playAlarmSound).mockRejectedValue(new Error('no audio device'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)

    await reconcileDueRecords(store, NOW + 1)

    expect((await store.get(alarm.id))?.notified).toBe(true)
  })

  it('still fires later records when one record’s notification throws', async () => {
    const store = newStore()
    const first = createAlarm('First', NOW, NOW)
    const second = createAlarm('Second', NOW, NOW)
    await store.upsert(first)
    await store.upsert(second)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // spyOn returns the already-installed spy if a previous test made one, so
    // clear its history rather than trusting a fresh count.
    const create = vi.spyOn(fakeBrowser.notifications, 'create')
    create.mockClear()
    create.mockRejectedValueOnce(new Error('icon download failed'))

    await expect(reconcileDueRecords(store, NOW + 1)).resolves.toBeUndefined()

    expect(create).toHaveBeenCalledTimes(2)
  })

  it('does not resurrect a record deleted while its notification is being shown', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    vi.spyOn(fakeBrowser.notifications, 'create').mockImplementation(async () => {
      await store.remove(alarm.id)
      return undefined
    })

    await reconcileDueRecords(store, NOW + 1)

    expect(await store.get(alarm.id)).toBeUndefined()
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
    expect(updated).toMatchObject({ snoozedUntil: NOW + 5000 + 5 * 60_000 })
  })

  it('snoozing a recurring alarm leaves its recurrence time untouched', async () => {
    const store = newStore()
    const sevenAm = new Date(2026, 1, 2, 7, 0, 0, 0).getTime()
    const alarm = createAlarm('Standup', sevenAm, sevenAm, { days: [1, 2, 3, 4, 5] })
    await store.upsert(alarm)
    await reconcileDueRecords(store, sevenAm + 1)

    await handleNotificationButton(store, `chronly-alarm-${alarm.id}`, 0, sevenAm + 1)

    // Writing the snooze into targetTimestamp would shift every future
    // occurrence to 07:05, then 07:10, and so on.
    const updated = await store.get(alarm.id)
    expect(updated?.kind === 'alarm' && new Date(updated.targetTimestamp).getMinutes()).toBe(0)
  })

  it('does not delete an alarm when the snooze clears its notification', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleNotificationButton(store, `chronly-alarm-${alarm.id}`, 0, NOW + 5000)
    // Clearing a notification fires onClosed, which must not treat a freshly
    // snoozed alarm as acknowledged.
    await handleNotificationClosed(store, `chronly-alarm-${alarm.id}`)

    expect(await store.get(alarm.id)).toBeDefined()
  })

  it('pauses a pomodoro from its notification button', async () => {
    const store = newStore()
    const pomodoro = createPomodoro(
      'Deep work',
      { focusMs: 1000, shortBreakMs: 500, longBreakMs: 2000, cyclesBeforeLongBreak: 4 },
      NOW,
    )
    await store.upsert(pomodoro)
    await reconcileDueRecords(store, NOW + 1000)

    await handleNotificationButton(store, `chronly-pomodoro-${pomodoro.id}`, 0, NOW + 1001)

    const updated = await store.get(pomodoro.id)
    expect(updated?.kind === 'pomodoro' && updated.status).toBe('paused')
  })

  it('removes a dismissed one-off alarm entirely', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleNotificationButton(store, `chronly-alarm-${alarm.id}`, 1, NOW + 5000) // Dismiss

    expect(await store.get(alarm.id)).toBeUndefined()
    expect(stopAlarmSound).toHaveBeenCalledWith(alarm.id)
  })

  it('stops a dismissed alarm even when record removal fails', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(handleNotificationButton(store, `chronly-alarm-${alarm.id}`, 1, NOW + 5000)).rejects.toThrow(
      'storage unavailable',
    )

    expect(stopAlarmSound).toHaveBeenCalledWith(alarm.id)
    expect(await fakeBrowser.notifications.getAll()).toEqual({})
  })

  it('ignores a notification whose record is already gone', async () => {
    const store = newStore()
    await expect(handleNotificationButton(store, 'chronly-alarm-missing', 0, NOW)).resolves.toBeUndefined()
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
