import { CITY_ALIASES } from './cityAliases'

export function formatTimeInZone(
  date: Date,
  timeZone: string,
  opts: { hour12: boolean; showSeconds: boolean },
): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: opts.hour12,
    hour: '2-digit',
    minute: '2-digit',
    second: opts.showSeconds ? '2-digit' : undefined,
  })
  return formatter.format(date)
}

export function getUtcOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(at)
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(raw)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? '0')
  return sign * (hours * 60 + minutes)
}

export function formatUtcOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  return `UTC${sign}${hours}${minutes ? ':' + String(minutes).padStart(2, '0') : ''}`
}

/** Returns calendar parts without depending on a locale's punctuation/order. */
export function getCalendarDateParts(date: Date, timeZone: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((entry) => entry.type === type)?.value ?? 0)
  return [part('year'), part('month'), part('day')]
}

export function getDayOffset(baseZone: string, targetZone: string, at: Date): number {
  const [baseYear, baseMonth, baseDay] = getCalendarDateParts(at, baseZone)
  const [targetYear, targetMonth, targetDay] = getCalendarDateParts(at, targetZone)
  const baseDate = Date.UTC(baseYear, baseMonth - 1, baseDay)
  const targetDate = Date.UTC(targetYear, targetMonth - 1, targetDay)
  return Math.round((targetDate - baseDate) / 86_400_000)
}

export function getRelativeDiffLabel(baseZone: string, targetZone: string, at: Date): string {
  const diffMinutes = getUtcOffsetMinutes(targetZone, at) - getUtcOffsetMinutes(baseZone, at)
  const sign = diffMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(diffMinutes)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  const hoursLabel = `${sign}${hours}h${minutes ? minutes + 'm' : ''}`
  const dayOffset = getDayOffset(baseZone, targetZone, at)
  const dayLabel =
    dayOffset === 0
      ? 'today'
      : dayOffset === 1
        ? 'tomorrow'
        : dayOffset === -1
          ? 'yesterday'
          : dayOffset > 0
            ? `${dayOffset} days ahead`
            : `${Math.abs(dayOffset)} days behind`
  return `${hoursLabel}, ${dayLabel}`
}

/**
 * Finds the UTC instant whose local representation in `timeZone` matches the given wall-clock
 * components, correcting for that zone's offset via fixed-point iteration (handles DST).
 */
export function zonedWallTimeToInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute)
  for (let i = 0; i < 3; i++) {
    const offset = getUtcOffsetMinutes(timeZone, new Date(guess))
    const corrected = Date.UTC(year, month - 1, day, hour, minute) - offset * 60_000
    if (corrected === guess) break
    guess = corrected
  }
  return new Date(guess)
}

/** The readable place name inside a zone id: "America/New_York" → "New York". */
export function cityFromZone(timeZone: string): string {
  const tail = timeZone.split('/').pop() ?? timeZone
  return tail.replace(/_/g, ' ')
}

function isKnownZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Turn what someone typed into a zone id: an exact id in any case
 * ("asia/tokyo"), a city as it reads ("New York", "sao paulo"), or a major city
 * without a zone of its own ("San Francisco"). Returns null when nothing fits.
 */
export function resolveTimeZone(input: string, zones: readonly string[]): string | null {
  const typed = input.trim().replace(/\s+/g, ' ')
  if (!typed) return null
  const lower = typed.toLowerCase()
  const asId = lower.replace(/ /g, '_')
  const exact = zones.find((zone) => zone.toLowerCase() === asId)
  if (exact) return exact
  const alias = CITY_ALIASES[lower]
  if (alias && isKnownZone(alias)) return alias
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const city = zones.find((zone) => fold(cityFromZone(zone)) === fold(typed))
  if (city) return city
  if (!isKnownZone(typed)) return null
  // "est" and "EST" are both accepted; store the runtime's canonical spelling.
  return new Intl.DateTimeFormat('en-US', { timeZone: typed }).resolvedOptions().timeZone
}
