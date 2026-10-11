import { describe, expect, it } from 'vitest'
import { formatClockParts, formatCountdown, formatSpent, formatStopwatch, spokenCountdown } from './format'

describe('formatCountdown', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatCountdown(65_000)).toBe('1:05')
  })

  it('adds hours past an hour', () => {
    expect(formatCountdown(3_723_000)).toBe('1:02:03')
  })

  it('rounds up so time left never reads as zero', () => {
    expect(formatCountdown(400)).toBe('0:01')
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(-5000)).toBe('0:00')
  })
})

describe('spokenCountdown', () => {
  it('names each non-zero unit', () => {
    expect(spokenCountdown(3_723_000)).toBe('1 hr 2 min 3 sec remaining')
    expect(spokenCountdown(5000)).toBe('5 sec remaining')
  })
})

describe('formatStopwatch', () => {
  it('shows centiseconds', () => {
    expect(formatStopwatch(62_345)).toBe('01:02.34')
  })

  it('adds hours past an hour', () => {
    expect(formatStopwatch(3_662_000)).toBe('1:01:02.00')
  })
})

describe('formatSpent', () => {
  it('reads minutes and hours', () => {
    expect(formatSpent(45 * 60_000)).toBe('45m')
    expect(formatSpent(125 * 60_000)).toBe('2h 5m')
  })
})

describe('formatClockParts', () => {
  const at = new Date(Date.UTC(2026, 1, 2, 19, 5, 9))

  it('keeps a 24-hour clock in one piece', () => {
    expect(formatClockParts(at, 'UTC', { hour12: false, showSeconds: true })).toEqual({ time: '19:05:09', period: '' })
  })

  it('sets the AM/PM marker apart on a 12-hour clock', () => {
    expect(formatClockParts(at, 'UTC', { hour12: true, showSeconds: false })).toEqual({ time: '7:05', period: 'PM' })
  })

  it('follows the requested zone', () => {
    expect(formatClockParts(at, 'Asia/Tokyo', { hour12: false, showSeconds: false }).time).toBe('04:05')
  })
})
