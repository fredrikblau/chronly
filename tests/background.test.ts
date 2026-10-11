import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playAlarmSound, stopAlarmSound } from '../lib/core/audio'
import { createAlarm, createCountdown, createPomodoro } from '../lib/core/scheduler'
import { disableAlarm, isAlarmArmed, pauseRecord, reconcileFiredRecord, resumeRecord } from '../lib/core/scheduler'
import {
  ActiveAlertStore,
  createExtensionStorageBackend,
  localDayKey,
  PomodoroStatsStore,
  RecordStore,
  SettingsStore,
} from '../lib/core/storage'
import {
  cleanupRemovedRecords,
  ensureTickAlarm,
  extractRecordId,
  handleAlertAction,
  handleNotificationButton,
  handleNotificationClicked,
  handleNotificationClosed,
  isUserClose,
  observeBackgroundTask,
  reconcileDueRecords,
  refreshToolbar,
  TICK_ALARM_NAME,
  TICK_PERIOD_MINUTES,
} from '../entrypoints/background'

// Audio needs a real AudioContext/offscreen document; the unit under test here
// is the reconciliation loop's handling of it, not playback itself.
vi.mock('../lib/core/audio', () => ({
  FADE_IN_MS: 30_000,
  playAlarmSound: vi.fn(async () => {}),
  stopAlarmSound: vi.fn(async () => {}),
  isSoundStatusMessage: vi.fn(() => false),
  localSoundStatus: vi.fn(() => ({ active: [], audible: [], levels: {} })),
}))

const NOW = 1_770_000_000_000

function newStore(): RecordStore {
  return new RecordStore(createExtensionStorageBackend('local'))
}

describe('observeBackgroundTask', () => {
  it('logs a rejected listener task with its context', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('storage unavailable')

    observeBackgroundTask(Promise.reject(error), 'could not reconcile records', 'tick')
    await Promise.resolve()

    expect(warn).toHaveBeenCalledWith('[chronly] could not reconcile records', 'tick', error)
  })
})

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

  it('drops the wake-up of a paused timer and restores it on resume', async () => {
    const store = newStore()
    const countdown = createCountdown('Tea', 5 * 60_000, NOW)
    await store.upsert(countdown)
    await reconcileDueRecords(store, NOW + 1000)
    expect(await fakeBrowser.alarms.get(`record:${countdown.id}`)).toBeDefined()

    await store.upsert(pauseRecord(countdown, NOW + 2000))
    await reconcileDueRecords(store, NOW + 2000)
    expect(await fakeBrowser.alarms.get(`record:${countdown.id}`)).toBeUndefined()

    await store.upsert(resumeRecord(pauseRecord(countdown, NOW + 2000), NOW + 3000))
    await reconcileDueRecords(store, NOW + 3000)
    expect(await fakeBrowser.alarms.get(`record:${countdown.id}`)).toMatchObject({
      scheduledTime: NOW + 5 * 60_000 + 1000,
    })
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

  it('fades an alarm in when gentle wake is on, but never a timer', async () => {
    await new SettingsStore(createExtensionStorageBackend('sync')).update({ gentleWake: true })
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    const countdown = createCountdown('Tea', 60_000, NOW - 60_000)
    await store.upsert(alarm)
    await store.upsert(countdown)

    await reconcileDueRecords(store, NOW + 1)

    const fadeFor = (id: string) => vi.mocked(playAlarmSound).mock.calls.find((call) => call[2] === id)?.[5]
    expect(fadeFor(alarm.id)).toBe(30_000)
    expect(fadeFor(countdown.id)).toBe(0)
  })

  it('starts alarms at full volume while gentle wake is off', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)

    await reconcileDueRecords(store, NOW + 1)

    expect(vi.mocked(playAlarmSound).mock.calls[0]?.[5]).toBe(0)
  })

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
    // snoozed alarm as acknowledged, even if the browser reports it as the user's.
    await handleNotificationClosed(store, `chronly-alarm-${alarm.id}`, true)

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

  it('switches a dismissed one-off alarm off and keeps it listed', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleNotificationButton(store, `chronly-alarm-${alarm.id}`, 1, NOW + 5000) // Dismiss

    // Like a phone's alarm clock: the alarm stays, spent, so it can be switched back on.
    const kept = await store.get(alarm.id)
    expect(kept?.kind === 'alarm' && isAlarmArmed(kept)).toBe(false)
    expect(stopAlarmSound).toHaveBeenCalledWith(alarm.id)
  })

  it('stops a dismissed timer even when record removal fails', async () => {
    const store = newStore()
    const countdown = createCountdown('Tea', 1000, NOW)
    await store.upsert(countdown)
    await reconcileDueRecords(store, NOW + 1000)
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(handleNotificationButton(store, `chronly-countdown-${countdown.id}`, 0, NOW + 5000)).rejects.toThrow(
      'storage unavailable',
    )

    expect(stopAlarmSound).toHaveBeenCalledWith(countdown.id)
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

    await handleNotificationClosed(store, `chronly-countdown-${countdown.id}`, true)

    expect(await store.get(countdown.id)).toBeUndefined()
  })

  it('keeps a recurring alarm when its notification is closed', async () => {
    const store = newStore()
    const alarm = createAlarm('Standup', NOW, NOW, { days: [1, 2, 3, 4, 5] })
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleNotificationClosed(store, `chronly-alarm-${alarm.id}`, true)

    expect(await store.get(alarm.id)).toBeDefined()
  })

  it('keeps ringing when the system, not the user, closes the notification', async () => {
    // Firefox reports a notification it could not show (blocked, Do Not
    // Disturb) as closed at once, without saying who closed it. Treating that
    // as a dismissal silenced alarms the moment they rang.
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleNotificationClosed(store, `chronly-alarm-${alarm.id}`)
    await handleNotificationClosed(store, `chronly-alarm-${alarm.id}`, false)

    expect(stopAlarmSound).not.toHaveBeenCalled()
    await vi.waitFor(async () => expect(await alerts().get(alarm.id)).toBeDefined())
  })

  it('acknowledges an alert when its notification is clicked', async () => {
    const store = newStore()
    const countdown = createCountdown('Tea', 1000, NOW)
    await store.upsert(countdown)
    await reconcileDueRecords(store, NOW + 1000)

    await handleNotificationClicked(store, `chronly-countdown-${countdown.id}`, NOW + 2000)

    expect(stopAlarmSound).toHaveBeenCalledWith(countdown.id)
    expect(await store.get(countdown.id)).toBeUndefined()
    expect(await fakeBrowser.notifications.getAll()).toEqual({})
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
    expect(await statsStore.get()).toMatchObject({
      totalFocusSessionsCompleted: 1,
      totalFocusMs: 1000,
      daily: { [localDayKey(NOW + 1000)]: { sessions: 1, focusMs: 1000 } },
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

function alerts(): ActiveAlertStore {
  return new ActiveAlertStore(createExtensionStorageBackend('session'))
}

describe('ringing alerts', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('lists a fired record as ringing until it is acknowledged', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)

    await reconcileDueRecords(store, NOW + 1)
    await vi.waitFor(async () =>
      expect(await alerts().getAll()).toEqual([
        expect.objectContaining({ recordId: alarm.id, kind: 'alarm', title: 'Wake up', firedAt: NOW + 1 }),
      ]),
    )

    await handleNotificationClosed(store, `chronly-alarm-${alarm.id}`, true)
    await vi.waitFor(async () => expect(await alerts().getAll()).toEqual([]))
  })

  it('lists the alert even when the notification itself fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(fakeBrowser.notifications, 'create').mockRejectedValueOnce(new Error('blocked'))
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)

    await reconcileDueRecords(store, NOW + 1)

    // The sound is already playing; the popup banner is now the only way to stop it.
    await vi.waitFor(async () => expect(await alerts().get(alarm.id)).toBeDefined())
  })

  it('snoozes an alarm from the popup banner and silences it', async () => {
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    await reconcileDueRecords(store, NOW + 1)

    await handleAlertAction(store, alarm.id, 'snooze', NOW + 2000)

    expect(await store.get(alarm.id)).toMatchObject({
      enabled: true,
      notified: false,
      snoozedUntil: NOW + 2000 + 5 * 60_000,
    })
    expect(stopAlarmSound).toHaveBeenCalledWith(alarm.id)
    expect(await fakeBrowser.notifications.getAll()).toEqual({})
    await vi.waitFor(async () => expect(await alerts().getAll()).toEqual([]))
  })

  it('snoozes for the length chosen in settings, and says so on the button', async () => {
    await new SettingsStore(createExtensionStorageBackend('sync')).update({ snoozeMinutes: 10 })
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)
    const create = vi.spyOn(fakeBrowser.notifications, 'create')
    create.mockClear()

    await reconcileDueRecords(store, NOW + 1)
    await handleAlertAction(store, alarm.id, 'snooze', NOW + 2000)

    expect(create.mock.calls[0]?.[1]).toMatchObject({ buttons: [{ title: 'Snooze 10 min' }, { title: 'Dismiss' }] })
    expect(await store.get(alarm.id)).toMatchObject({ snoozedUntil: NOW + 2000 + 10 * 60_000 })
  })

  it('pauses the next Pomodoro phase from the popup banner', async () => {
    const store = newStore()
    const pomodoro = createPomodoro(
      'Deep work',
      { focusMs: 1000, shortBreakMs: 500, longBreakMs: 2000, cyclesBeforeLongBreak: 4 },
      NOW,
    )
    await store.upsert(pomodoro)
    await reconcileDueRecords(store, NOW + 1000)

    await handleAlertAction(store, pomodoro.id, 'pause', NOW + 1001)

    expect(await store.get(pomodoro.id)).toMatchObject({ status: 'paused', phase: 'shortBreak' })
  })

  it('removes a finished timer dismissed from the popup banner', async () => {
    const store = newStore()
    const countdown = createCountdown('Tea', 1000, NOW)
    await store.upsert(countdown)
    await reconcileDueRecords(store, NOW + 1000)

    await handleAlertAction(store, countdown.id, 'dismiss', NOW + 2000)

    expect(await store.get(countdown.id)).toBeUndefined()
  })

  it('advances a still-due record when its alert is dismissed', async () => {
    // The notification failed, so the tick left the record due; dismissing
    // must acknowledge it or it would ring again on the next tick.
    const store = newStore()
    const alarm = createAlarm('Wake up', NOW, NOW)
    await store.upsert(alarm)

    await handleAlertAction(store, alarm.id, 'dismiss', NOW + 1000)

    expect(await store.get(alarm.id)).toMatchObject({ notified: true })
  })

  it('still silences an alert whose record has been deleted', async () => {
    const store = newStore()
    await alerts().add({
      recordId: 'gone',
      kind: 'alarm',
      notificationId: 'chronly-alarm-gone',
      title: 'Gone',
      message: 'Your alarm is going off.',
      firedAt: NOW,
    })

    await handleAlertAction(store, 'gone', 'dismiss', NOW)

    expect(stopAlarmSound).toHaveBeenCalledWith('gone')
    await vi.waitFor(async () => expect(await alerts().getAll()).toEqual([]))
  })

  it('silences an alarm that is switched off while it rings', async () => {
    const alarm = createAlarm('Standup', NOW, NOW, { days: [1, 2, 3, 4, 5] })

    await cleanupRemovedRecords({ [alarm.id]: alarm }, { [alarm.id]: disableAlarm(alarm, NOW) })

    expect(stopAlarmSound).toHaveBeenCalledWith(alarm.id)
  })

  it('keeps ringing when a one-off alarm fires', async () => {
    // Regression: firing once wrote `enabled: false`, which this cleanup read as
    // the user switching the alarm off, silencing every one-off alarm at once.
    const alarm = createAlarm('Wake up', NOW, NOW)

    await cleanupRemovedRecords({ [alarm.id]: alarm }, { [alarm.id]: reconcileFiredRecord(alarm, NOW + 1) })

    expect(stopAlarmSound).not.toHaveBeenCalled()
  })

  it('leaves an edited alarm that is still on alone', async () => {
    const alarm = createAlarm('Standup', NOW, NOW)

    await cleanupRemovedRecords({ [alarm.id]: alarm }, { [alarm.id]: { ...alarm, label: 'Daily standup' } })

    expect(stopAlarmSound).not.toHaveBeenCalled()
  })
})

describe('refreshToolbar', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  const ringing = {
    recordId: 'a',
    kind: 'alarm' as const,
    notificationId: 'chronly-alarm-a',
    title: 'Wake up',
    message: 'Your alarm is going off.',
    firedAt: NOW,
  }

  it('flags the toolbar icon while something rings', async () => {
    await alerts().add(ringing)

    await refreshToolbar(newStore(), NOW)

    expect(await fakeBrowser.action.getBadgeText({})).toBe('!')
    expect(await fakeBrowser.action.getTitle({})).toBe('Chronly — Wake up is ringing')
  })

  it('clears the flag once nothing rings', async () => {
    await alerts().add(ringing)
    await refreshToolbar(newStore(), NOW)
    await alerts().remove('a')

    await refreshToolbar(newStore(), NOW)

    expect(await fakeBrowser.action.getBadgeText({})).toBe('')
    expect(await fakeBrowser.action.getTitle({})).toBe('Chronly')
  })

  it('names the next alarm in the tooltip when nothing rings', async () => {
    const store = newStore()
    await store.upsert(createAlarm('Standup', NOW + 3_600_000, NOW))

    await refreshToolbar(store, NOW)

    expect(await fakeBrowser.action.getTitle({})).toMatch(/^Chronly — next alarm (today|tomorrow) .+ \(Standup\)$/)
  })
})

describe('handleNotificationButton on a Test preview', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('clears the preview notification even though no record exists', async () => {
    await fakeBrowser.notifications.create('chronly-alarm-preview-1', {
      type: 'basic',
      iconUrl: '/icon-128.png',
      title: 'Preview',
      message: 'Your alarm is going off.',
    })

    await handleNotificationButton(newStore(), 'chronly-alarm-preview-1', 0, NOW)

    expect(await fakeBrowser.notifications.getAll()).toEqual({})
  })
})

describe('isUserClose', () => {
  it('trusts Chrome when it says the person closed the notification', () => {
    expect(isUserClose(true, false)).toBe(true)
    expect(isUserClose(false, false)).toBe(false)
  })

  it('never trusts Firefox, which reports every close as the user’s', () => {
    expect(isUserClose(true, true)).toBe(false)
  })
})
