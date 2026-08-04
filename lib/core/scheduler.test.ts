import { describe, expect, it } from 'vitest'
import {
  advancePomodoroPhase,
  computeDueRecords,
  computeNextAlarmOccurrence,
  createAlarm,
  createCountdown,
  createPomodoro,
  isDue,
  markNotified,
  pauseRecord,
  reconcileFiredRecord,
  resumeRecord,
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
