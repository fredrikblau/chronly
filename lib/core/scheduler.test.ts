import { describe, expect, it } from 'vitest'
import {
  advancePomodoroPhase,
  computeDueRecords,
  computeNextAlarmOccurrence,
  createAlarm,
  effectiveDueTime,
  createCountdown,
  createPomodoro,
  disableAlarm,
  editAlarm,
  enableAlarm,
  extendCountdown,
  isAlarmArmed,
  isDue,
  markNotified,
  pauseRecord,
  reconcileFiredRecord,
  resumeRecord,
  skipPomodoroPhase,
  snoozeAlarm,
} from './scheduler'
import type { AlarmRecord, PomodoroConfig, PomodoroRecord } from './types'

const NOW = 1_770_000_000_000 // fixed reference instant

describe('isDue', () => {
  it('is false for a future countdown', () => {
    const record = createCountdown('Tea', 5 * 60_000, NOW)
    expect(isDue(record, NOW)).toBe(false)
  })

  it('is true once the target timestamp has passed', () => {
    const record = createCountdown('Tea', 5 * 60_000, NOW)
    expect(isDue(record, NOW + 5 * 60_000 + 1)).toBe(true)
  })

  it('is false once already notified (idempotency)', () => {
    const record = markNotified(createCountdown('Tea', 1000, NOW), NOW + 1000)
    expect(isDue(record, NOW + 5000)).toBe(false)
  })

  it('is false for a paused countdown even if its stale target has passed', () => {
    const running = createCountdown('Tea', 1000, NOW)
    const paused = pauseRecord(running, NOW + 500)
    expect(isDue(paused, NOW + 5000)).toBe(false)
  })
})

describe('computeDueRecords', () => {
  it('filters to only due records', () => {
    const early = createCountdown('Early', 1000, NOW)
    const late = createCountdown('Late', 10_000, NOW)
    expect(computeDueRecords([early, late], NOW + 2000).map((r) => r.label)).toEqual(['Early'])
  })
})

describe('computeNextAlarmOccurrence', () => {
  it('returns null for a one-off alarm', () => {
    const alarm = createAlarm('Wake up', NOW + 1000, NOW, null)
    expect(computeNextAlarmOccurrence(alarm, NOW + 1000)).toBeNull()
  })

  it('finds the next matching weekday for a recurring alarm', () => {
    // NOW corresponds to 2026-02-01T12:00:00.000Z, a Sunday.
    const target = new Date(NOW)
    target.setHours(7, 0, 0, 0)
    const alarm = createAlarm('Weekday wake up', target.getTime(), NOW, { days: [1, 2, 3, 4, 5] }) // Mon-Fri
    const next = computeNextAlarmOccurrence(alarm, NOW)
    expect(next).not.toBeNull()
    expect(new Date(next!).getDay()).toBe(1) // Monday
  })
})

describe('reconcileFiredRecord', () => {
  it('keeps a fired one-off alarm in storage, marked notified, for the caller to dismiss or snooze', () => {
    const alarm = createAlarm('Once', NOW, NOW, null)
    const result = reconcileFiredRecord(alarm, NOW + 1) as AlarmRecord
    expect(result.notified).toBe(true)
    expect(result.targetTimestamp).toBe(NOW)
  })

  it('reschedules a fired recurring alarm to its next occurrence, un-notified', () => {
    const target = new Date(NOW)
    target.setHours(7, 0, 0, 0)
    const alarm = createAlarm('Recurring', target.getTime(), NOW, { days: [0, 1, 2, 3, 4, 5, 6] })
    const result = reconcileFiredRecord(alarm, target.getTime() + 1) as AlarmRecord
    expect(result.notified).toBe(false)
    expect(result.targetTimestamp).toBeGreaterThan(target.getTime())
  })

  it('marks a fired countdown as completed', () => {
    const countdown = createCountdown('Tea', 1000, NOW)
    const result = reconcileFiredRecord(countdown, NOW + 1000)
    expect(result.kind).toBe('countdown')
    expect((result as typeof countdown).status).toBe('completed')
  })

  it('advances a fired pomodoro to its next phase', () => {
    const config: PomodoroConfig = { focusMs: 1000, shortBreakMs: 500, longBreakMs: 2000, cyclesBeforeLongBreak: 4 }
    const pomodoro = createPomodoro('Focus', config, NOW)
    const result = reconcileFiredRecord(pomodoro, NOW + 1000) as PomodoroRecord
    expect(result.phase).toBe('shortBreak')
    expect(result.status).toBe('running')
    expect(result.notified).toBe(false)
  })
})

describe('advancePomodoroPhase', () => {
  const config: PomodoroConfig = { focusMs: 1000, shortBreakMs: 500, longBreakMs: 2000, cyclesBeforeLongBreak: 2 }

  it('cycles focus -> shortBreak -> focus -> longBreak', () => {
    let record = createPomodoro('Focus', config, NOW)
    record = advancePomodoroPhase(record, NOW + 1000) // 1st focus done -> shortBreak
    expect(record.phase).toBe('shortBreak')
    record = advancePomodoroPhase(record, NOW + 1500) // break done -> focus
    expect(record.phase).toBe('focus')
    record = advancePomodoroPhase(record, NOW + 2500) // 2nd focus done, cyclesBeforeLongBreak=2 -> longBreak
    expect(record.phase).toBe('longBreak')
  })
})

describe('pauseRecord / resumeRecord', () => {
  it('preserves the exact remaining duration across a pause/resume round trip', () => {
    const running = createCountdown('Tea', 10_000, NOW)
    const paused = pauseRecord(running, NOW + 3000)
    expect(paused.status).toBe('paused')
    expect(paused.remainingMsAtPause).toBe(7000)
    const resumed = resumeRecord(paused, NOW + 100_000)
    expect(resumed.status).toBe('running')
    expect(resumed.targetTimestamp).toBe(NOW + 100_000 + 7000)
  })
})

describe('snoozeAlarm', () => {
  it('makes the alarm due again after the snooze window, not before', () => {
    const alarm = snoozeAlarm(createAlarm('Wake up', NOW, NOW), NOW)
    expect(isDue(alarm, NOW + 4 * 60_000)).toBe(false)
    expect(isDue(alarm, NOW + 5 * 60_000)).toBe(true)
  })

  it('leaves targetTimestamp alone so recurrence stays anchored', () => {
    const sevenAm = new Date(2026, 1, 2, 7, 0, 0, 0).getTime()
    const alarm = createAlarm('Standup', sevenAm, sevenAm, { days: [1, 2, 3, 4, 5] })
    const snoozed = snoozeAlarm(alarm, sevenAm)
    expect(snoozed.targetTimestamp).toBe(alarm.targetTimestamp)
    expect(new Date(computeNextAlarmOccurrence(snoozed, sevenAm)!).getMinutes()).toBe(0)
  })

  it('clears the snooze once the snoozed alarm fires', () => {
    const alarm = snoozeAlarm(createAlarm('Wake up', NOW, NOW), NOW)
    const fired = reconcileFiredRecord(alarm, NOW + 5 * 60_000)
    expect(fired.kind === 'alarm' && fired.snoozedUntil).toBeNull()
  })
})

describe('effectiveDueTime', () => {
  it('still fires an alarm stored before snoozedUntil existed', () => {
    const alarm = createAlarm('Legacy', NOW, NOW)
    // Simulate a record written by an earlier version, or by hand.
    const legacy = { ...alarm } as Partial<AlarmRecord> as AlarmRecord
    delete (legacy as { snoozedUntil?: number | null }).snoozedUntil
    expect(effectiveDueTime(legacy)).toBe(NOW)
    expect(isDue(legacy, NOW + 1)).toBe(true)
  })
})

// 2026-02-02 is a Monday in local time.
const MONDAY_8AM = new Date(2026, 1, 2, 8, 0).getTime()

describe('alarm on/off switch', () => {
  it('never fires a switched-off alarm', () => {
    const alarm = disableAlarm(createAlarm('Wake up', NOW, NOW), NOW)
    expect(isDue(alarm, NOW + 1)).toBe(false)
  })

  it('treats an alarm saved before the switch existed as on', () => {
    const legacy: AlarmRecord = { ...createAlarm('Wake up', NOW, NOW), enabled: undefined }
    expect(isDue(legacy, NOW + 1)).toBe(true)
    expect(isAlarmArmed(legacy)).toBe(true)
  })

  it('reads a one-off alarm as off once it has rung, without touching its switch', () => {
    const fired = reconcileFiredRecord(createAlarm('Wake up', NOW, NOW), NOW + 1) as AlarmRecord
    // The background silences a ring when `enabled` flips, so firing must not.
    expect(fired.enabled).toBe(true)
    expect(isAlarmArmed(fired)).toBe(false)
  })

  it('counts a rung legacy one-off alarm as spent', () => {
    const legacy: AlarmRecord = { ...createAlarm('Wake up', NOW, NOW), notified: true, enabled: undefined }
    expect(isAlarmArmed(legacy)).toBe(false)
  })

  it('keeps a recurring alarm on after it rings', () => {
    const alarm = createAlarm('Standup', MONDAY_8AM, MONDAY_8AM, { days: [1, 2, 3, 4, 5] })
    const fired = reconcileFiredRecord(alarm, MONDAY_8AM + 1) as AlarmRecord
    expect(isAlarmArmed(fired)).toBe(true)
  })

  it('re-arms a rung one-off alarm for the next time its clock time comes round', () => {
    const rung = reconcileFiredRecord(createAlarm('Wake up', MONDAY_8AM, MONDAY_8AM), MONDAY_8AM + 1) as AlarmRecord
    const armed = enableAlarm(rung, MONDAY_8AM + 60_000)
    expect(armed).toMatchObject({ enabled: true, notified: false, snoozedUntil: null })
    expect(armed.targetTimestamp).toBe(new Date(2026, 1, 3, 8, 0).getTime())
  })

  it('re-arms a recurring alarm on its next selected day, not a stale past one', () => {
    const friday = new Date(2026, 1, 6, 7, 0).getTime()
    const alarm = disableAlarm(createAlarm('Gym', new Date(2026, 1, 2, 7, 0).getTime(), NOW, { days: [1] }), NOW)
    const armed = enableAlarm(alarm, friday)
    expect(new Date(armed.targetTimestamp)).toEqual(new Date(2026, 1, 9, 7, 0))
  })

  it('drops a pending snooze when switched off', () => {
    const snoozed = snoozeAlarm(createAlarm('Wake up', NOW, NOW), NOW)
    expect(disableAlarm(snoozed, NOW).snoozedUntil).toBeNull()
  })
})

describe('editAlarm', () => {
  it('keeps the identity and reschedules from the new time', () => {
    const alarm = createAlarm('Wake up', MONDAY_8AM, MONDAY_8AM)
    const edited = editAlarm(
      alarm,
      { label: 'Gym', hour: 18, minute: 30, days: [3, 1], soundId: 'gentle', volume: 0.4 },
      MONDAY_8AM,
    )
    expect(edited).toMatchObject({
      id: alarm.id,
      createdAt: alarm.createdAt,
      label: 'Gym',
      soundId: 'gentle',
      volume: 0.4,
      recurrence: { days: [1, 3] },
      enabled: true,
      notified: false,
    })
    expect(new Date(edited.targetTimestamp)).toEqual(new Date(2026, 1, 2, 18, 30))
  })

  it('turns an emptied day list into a one-off alarm', () => {
    const alarm = createAlarm('Gym', MONDAY_8AM, MONDAY_8AM, { days: [1] })
    const edited = editAlarm(
      alarm,
      { label: 'Gym', hour: 9, minute: 0, days: [], soundId: 'default', volume: 1 },
      MONDAY_8AM,
    )
    expect(edited.recurrence).toBeNull()
  })
})

describe('extendCountdown', () => {
  it('pushes a running timer back without moving its progress', () => {
    const timer = createCountdown('Tea', 120_000, NOW)
    const extended = extendCountdown(timer, 60_000, NOW + 60_000)
    expect(extended.targetTimestamp).toBe(NOW + 180_000)
    expect(extended.durationMs).toBe(180_000)
  })

  it('adds to the banked remainder of a paused timer', () => {
    const paused = pauseRecord(createCountdown('Tea', 120_000, NOW), NOW + 30_000)
    const extended = extendCountdown(paused, 60_000, NOW + 40_000)
    expect(extended).toMatchObject({ status: 'paused', remainingMsAtPause: 150_000 })
  })

  it('restarts a finished timer from the extra time', () => {
    const done = reconcileFiredRecord(createCountdown('Tea', 1000, NOW), NOW + 1000)
    const extended = extendCountdown(done as ReturnType<typeof createCountdown>, 60_000, NOW + 5000)
    expect(extended).toMatchObject({ status: 'running', notified: false, targetTimestamp: NOW + 65_000 })
  })
})

describe('skipPomodoroPhase', () => {
  const config: PomodoroConfig = { focusMs: 1000, shortBreakMs: 500, longBreakMs: 2000, cyclesBeforeLongBreak: 2 }

  it('moves a running focus phase straight into its break', () => {
    const skipped = skipPomodoroPhase(createPomodoro('Work', config, NOW), NOW + 100)
    expect(skipped).toMatchObject({ phase: 'shortBreak', status: 'running', targetTimestamp: NOW + 600 })
  })

  it('keeps a paused session paused at the start of the next phase', () => {
    const paused = pauseRecord(createPomodoro('Work', config, NOW), NOW + 100)
    const skipped = skipPomodoroPhase(paused, NOW + 200)
    expect(skipped).toMatchObject({ phase: 'shortBreak', status: 'paused', remainingMsAtPause: 500 })
  })
})
