import { describe, expect, it } from 'vitest'
import {
  formatTimeInZone,
  formatUtcOffsetLabel,
  getCalendarDateParts,
  getDayOffset,
  getRelativeDiffLabel,
  getUtcOffsetMinutes,
  zonedWallTimeToInstant,
} from './time'

describe('formatTimeInZone', () => {
  it('formats a 24-hour time without seconds', () => {
    const date = new Date('2026-01-15T12:30:00Z')
    expect(formatTimeInZone(date, 'UTC', { hour12: false, showSeconds: false })).toBe('12:30')
  })
})

describe('getUtcOffsetMinutes', () => {
  it('returns 0 for UTC', () => {
    expect(getUtcOffsetMinutes('UTC', new Date('2026-01-15T00:00:00Z'))).toBe(0)
  })

  it('returns a positive half-hour offset for Asia/Kolkata', () => {
    expect(getUtcOffsetMinutes('Asia/Kolkata', new Date('2026-01-15T00:00:00Z'))).toBe(330)
  })

  it('returns a negative offset for America/New_York in January (EST)', () => {
    expect(getUtcOffsetMinutes('America/New_York', new Date('2026-01-15T00:00:00Z'))).toBe(-300)
  })

  it('reflects daylight saving time for America/New_York in July (EDT)', () => {
    expect(getUtcOffsetMinutes('America/New_York', new Date('2026-07-15T00:00:00Z'))).toBe(-240)
  })
})

describe('formatUtcOffsetLabel', () => {
  it('formats a whole-hour negative offset', () => {
    expect(formatUtcOffsetLabel(-300)).toBe('UTC-5')
  })

  it('formats a half-hour positive offset', () => {
    expect(formatUtcOffsetLabel(330)).toBe('UTC+5:30')
  })
})

describe('getDayOffset', () => {
  it('is 0 when both zones are on the same calendar day', () => {
    expect(getDayOffset('UTC', 'Europe/London', new Date('2026-01-15T10:00:00Z'))).toBe(0)
  })

  it('is positive when the target zone is a calendar day ahead', () => {
    expect(getDayOffset('America/Los_Angeles', 'Pacific/Kiritimati', new Date('2026-01-15T20:00:00Z'))).toBeGreaterThan(0)
  })
})

describe('getCalendarDateParts', () => {
  it('returns numeric calendar parts for a target zone', () => {
    const parts = getCalendarDateParts(new Date('2026-01-15T23:30:00Z'), 'Asia/Tokyo')
    expect(parts).toEqual([2026, 1, 16])
  })
})

describe('getRelativeDiffLabel', () => {
  it('describes a same-day positive offset', () => {
    const at = new Date('2026-01-15T10:00:00Z')
    expect(getRelativeDiffLabel('UTC', 'Asia/Kolkata', at)).toBe('+5h30m, today')
  })
})

describe('zonedWallTimeToInstant', () => {
  it('round-trips a standard-time wall clock in New York', () => {
    const instant = zonedWallTimeToInstant('America/New_York', 2026, 1, 15, 9, 0)
    expect(formatTimeInZone(instant, 'America/New_York', { hour12: false, showSeconds: false })).toBe('09:00')
  })

  it('round-trips a daylight-saving wall clock in New York', () => {
    const instant = zonedWallTimeToInstant('America/New_York', 2026, 7, 15, 9, 0)
    expect(formatTimeInZone(instant, 'America/New_York', { hour12: false, showSeconds: false })).toBe('09:00')
  })
})
