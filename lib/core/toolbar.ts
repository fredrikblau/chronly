import { effectiveDueTime, isAlarmArmed } from './scheduler'
import type { ActiveAlert, AlarmRecord, SchedulableRecord } from './types'

const DAY_MS = 86_400_000

function startOfDay(at: number): number {
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

export interface TitleOptions {
  /** The user's clock preference, as on every other time Chronly shows. */
  hour12?: boolean
  locale?: string
}

/** "today 07:00", "tomorrow 07:00", or "Mon 07:00" for later this week. */
export function describeWhen(due: number, now: number, { hour12 = false, locale }: TitleOptions = {}): string {
  const time = new Date(due).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12 })
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS)
  if (days === 0) return `today ${time}`
  if (days === 1) return `tomorrow ${time}`
  const weekday = new Date(due).toLocaleDateString(locale, { weekday: 'short' })
  return days < 7
    ? `${weekday} ${time}`
    : `${new Date(due).toLocaleDateString(locale, { month: 'short', day: 'numeric' })} ${time}`
}

/**
 * The toolbar button's tooltip. A ringing alert takes priority, since that is
 * what someone hovering most needs to know; otherwise it names the next alarm
 * so it can be checked without opening the popup.
 */
export function toolbarTitle(
  alerts: ActiveAlert[],
  records: SchedulableRecord[],
  now: number,
  options: TitleOptions = {},
): string {
  const [ringing] = alerts
  if (ringing) {
    const more = alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ''
    return `Chronly — ${ringing.title} is ringing${more}`
  }
  const next = records
    .filter((record): record is AlarmRecord => record.kind === 'alarm' && isAlarmArmed(record))
    .filter((alarm) => effectiveDueTime(alarm) > now)
    .sort((a, b) => effectiveDueTime(a) - effectiveDueTime(b))[0]
  if (!next) return 'Chronly'
  return `Chronly — next alarm ${describeWhen(effectiveDueTime(next), now, options)} (${next.label})`
}
