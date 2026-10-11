/** Shared display formatting, so every view renders the same span the same way. */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * A countdown readout: "4:05", or "1:04:05" past an hour. Rounds up, so a timer
 * never shows 0:00 while it still has time left to run.
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** The same span read aloud: "1 hr 4 min 5 sec remaining". */
export function spokenCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = [hours && `${hours} hr`, minutes && `${minutes} min`, `${seconds} sec`].filter(Boolean)
  return `${parts.join(' ')} remaining`
}

/** Stopwatch readout with centiseconds: "01:02.34", or "1:01:02.34". */
export function formatStopwatch(ms: number): string {
  const totalCentis = Math.floor(Math.max(0, ms) / 10)
  const centis = totalCentis % 100
  const totalSeconds = Math.floor(totalCentis / 100)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : pad(minutes)
  return `${head}:${pad(seconds)}.${pad(centis)}`
}

/** A total of time spent: "45m", "2h 5m". */
export function formatSpent(ms: number): string {
  const totalMinutes = Math.round(Math.max(0, ms) / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const rest = totalMinutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}

export interface ClockParts {
  /** "07:41:14" in 24-hour mode, "7:41:14" in 12-hour mode. */
  time: string
  /** "AM"/"PM" in 12-hour mode, empty otherwise. */
  period: string
}

/**
 * Wall-clock time in a zone, split so a 12-hour clock can set its AM/PM marker
 * apart from the digits instead of letting it wrap under them.
 */
export function formatClockParts(
  at: Date,
  timeZone: string,
  opts: { hour12: boolean; showSeconds: boolean },
): ClockParts {
  const parts = new Intl.DateTimeFormat(opts.hour12 ? 'en-US' : 'en-GB', {
    timeZone,
    hour12: opts.hour12,
    hour: opts.hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    second: opts.showSeconds ? '2-digit' : undefined,
  }).formatToParts(at)
  const time = parts
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim()
  const period = parts.find((part) => part.type === 'dayPeriod')?.value.toUpperCase() ?? ''
  return { time, period }
}
