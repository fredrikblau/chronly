import type { AlarmRecurrence } from '../core/types'

/** Indexed by `Date#getDay()`: 0 = Sunday .. 6 = Saturday. */
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [0, 6]

/**
 * Alarms fire by device-local wall-clock time (not a saved timezone) — the same
 * assumption a phone's alarm clock makes, and what "set an alarm for 7am" means
 * to a user.
 *
 * `days` (0 = Sunday) is the repeat schedule. Without it the answer is simply
 * today or tomorrow; with it the first ring has to land on a selected day,
 * otherwise a Mon/Wed alarm created on a Friday morning would ring that same
 * Friday before the recurrence logic ever gets a say.
 */
export function nextOccurrence(hour: number, minute: number, now: number, days?: number[]): number {
  const candidate = new Date(now)
  candidate.setHours(hour, minute, 0, 0)
  if (candidate.getTime() <= now) candidate.setDate(candidate.getDate() + 1)
  if (!days || days.length === 0) return candidate.getTime()
  for (let i = 0; i < 7; i++) {
    if (days.includes(candidate.getDay())) break
    candidate.setDate(candidate.getDate() + 1)
    // Re-apply the wall-clock time: a DST boundary crossed by the day step
    // would otherwise shift the alarm by an hour.
    candidate.setHours(hour, minute, 0, 0)
  }
  return candidate.getTime()
}

function sameDays(days: number[], expected: number[]): boolean {
  return days.length === expected.length && expected.every((d) => days.includes(d))
}

/** Human summary of a repeat schedule, e.g. "Once", "Weekdays", "Mon, Wed, Fri". */
export function describeRecurrence(recurrence: AlarmRecurrence | null | undefined): string {
  const days = recurrence?.days ?? []
  if (days.length === 0) return 'Once'
  if (days.length === 7) return 'Every day'
  if (sameDays(days, WEEKDAYS)) return 'Weekdays'
  if (sameDays(days, WEEKEND)) return 'Weekends'
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(', ')
}

/** Relative countdown to a due time, e.g. "in 2 hr 5 min". */
export function describeTimeUntil(target: number, now: number): string {
  const remaining = target - now
  if (remaining <= 0) return 'Due now'
  if (remaining < MINUTE_MS) return 'in less than a minute'
  if (remaining < HOUR_MS) return `in ${Math.floor(remaining / MINUTE_MS)} min`
  if (remaining < DAY_MS) {
    const hours = Math.floor(remaining / HOUR_MS)
    const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS)
    return minutes === 0 ? `in ${hours} hr` : `in ${hours} hr ${minutes} min`
  }
  const days = Math.floor(remaining / DAY_MS)
  return `in ${days} ${days === 1 ? 'day' : 'days'}`
}

/** The alarm's time of day, rendered in the user's preferred clock format. */
export function formatAlarmClock(timestamp: number, hour12: boolean): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  })
}
