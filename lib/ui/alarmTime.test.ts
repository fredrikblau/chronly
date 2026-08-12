import { describe, expect, it } from 'vitest'
import { DAY_LABELS, describeRecurrence, describeTimeUntil, formatAlarmClock, nextOccurrence } from './alarmTime'

// 2026-02-02 is a Monday in local time.
const MONDAY_6AM = new Date(2026, 1, 2, 6, 0, 0).getTime()
const MONDAY_8AM = new Date(2026, 1, 2, 8, 0, 0).getTime()

describe('nextOccurrence', () => {
  it('returns later today when the time has not passed yet', () => {
    const result = new Date(nextOccurrence(7, 0, MONDAY_6AM))
    expect(result.getDate()).toBe(2)
    expect(result.getHours()).toBe(7)
    expect(result.getMinutes()).toBe(0)
  })

  it('rolls over to tomorrow when the time has already passed today', () => {
    const result = new Date(nextOccurrence(7, 0, MONDAY_8AM))
    expect(result.getDate()).toBe(3)
    expect(result.getHours()).toBe(7)
  })

  it('zeroes out seconds and milliseconds', () => {
    const now = new Date(2026, 1, 2, 6, 0, 37, 512).getTime()
    const result = new Date(nextOccurrence(7, 0, now))
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })

  it('lands on the next selected weekday when the alarm repeats', () => {
    // Monday 08:00, repeating on Wednesday (3) and Friday (5).
    const result = new Date(nextOccurrence(7, 0, MONDAY_8AM, [3, 5]))
    expect(result.getDay()).toBe(3)
    expect(result.getDate()).toBe(4)
    expect(result.getHours()).toBe(7)
  })

  it('keeps today when today is a selected day and the time is still ahead', () => {
    const result = new Date(nextOccurrence(7, 0, MONDAY_6AM, [1]))
    expect(result.getDate()).toBe(2)
  })

  it('wraps into next week when the only selected day is today but already past', () => {
    const result = new Date(nextOccurrence(7, 0, MONDAY_8AM, [1]))
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(9)
  })

  it('ignores an empty day list', () => {
    expect(nextOccurrence(7, 0, MONDAY_6AM, [])).toBe(nextOccurrence(7, 0, MONDAY_6AM))
  })
})

describe('describeRecurrence', () => {
  it('describes a one-off alarm', () => {
    expect(describeRecurrence(null)).toBe('Once')
    expect(describeRecurrence({ days: [] })).toBe('Once')
  })

  it('collapses the full week', () => {
    expect(describeRecurrence({ days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day')
  })

  it('names the common weekday and weekend sets', () => {
    expect(describeRecurrence({ days: [1, 2, 3, 4, 5] })).toBe('Weekdays')
    expect(describeRecurrence({ days: [0, 6] })).toBe('Weekends')
  })

  it('lists arbitrary days in week order', () => {
    expect(describeRecurrence({ days: [5, 1, 3] })).toBe('Mon, Wed, Fri')
  })
})

describe('describeTimeUntil', () => {
  const now = MONDAY_6AM

  it('reports a due alarm', () => {
    expect(describeTimeUntil(now, now)).toBe('Due now')
    expect(describeTimeUntil(now - 1000, now)).toBe('Due now')
  })

  it('reports sub-minute gaps without a misleading zero', () => {
    expect(describeTimeUntil(now + 30_000, now)).toBe('in less than a minute')
  })

  it('reports minutes', () => {
    expect(describeTimeUntil(now + 45 * 60_000, now)).toBe('in 45 min')
    expect(describeTimeUntil(now + 60_000, now)).toBe('in 1 min')
  })

  it('reports hours and minutes', () => {
    expect(describeTimeUntil(now + 2 * 3_600_000 + 5 * 60_000, now)).toBe('in 2 hr 5 min')
    expect(describeTimeUntil(now + 3 * 3_600_000, now)).toBe('in 3 hr')
  })

  it('reports whole days', () => {
    expect(describeTimeUntil(now + 26 * 3_600_000, now)).toBe('in 1 day')
    expect(describeTimeUntil(now + 3 * 86_400_000, now)).toBe('in 3 days')
  })
})

describe('formatAlarmClock', () => {
  it('formats a 24-hour clock time', () => {
    expect(formatAlarmClock(new Date(2026, 1, 2, 7, 5).getTime(), false)).toBe('07:05')
  })

  it('formats a 12-hour clock time with a meridiem', () => {
    const formatted = formatAlarmClock(new Date(2026, 1, 2, 7, 5).getTime(), true)
    expect(formatted).toMatch(/7:05/)
    expect(formatted.toUpperCase()).toContain('AM')
  })
})

describe('DAY_LABELS', () => {
  it('is indexed by Date#getDay', () => {
    expect(DAY_LABELS[0]).toBe('Sun')
    expect(DAY_LABELS[6]).toBe('Sat')
    expect(DAY_LABELS).toHaveLength(7)
  })
})
