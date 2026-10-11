import { browser } from 'wxt/browser'
import type { PomodoroRecord, SchedulableRecord } from './types'

/**
 * What a person can do about an alert that is ringing. The same actions back
 * the notification buttons and the popup's ringing banner, so the two can never
 * disagree about what "Dismiss" means.
 */
export type AlertAction = 'snooze' | 'pause' | 'dismiss'

/** Notification buttons by record kind, in button-index order. */
export const NOTIFICATION_ACTIONS: Record<SchedulableRecord['kind'], AlertAction[]> = {
  alarm: ['snooze', 'dismiss'],
  countdown: ['dismiss'],
  // The next phase has already started automatically by the time the
  // notification is shown, so pausing is the only action left worth offering.
  pomodoro: ['pause'],
}

/** Actions the popup banner offers; it can always offer Dismiss as well. */
export const BANNER_ACTIONS: Record<SchedulableRecord['kind'], AlertAction[]> = {
  alarm: ['snooze', 'dismiss'],
  countdown: ['dismiss'],
  pomodoro: ['pause', 'dismiss'],
}

export const ALERT_ACTION_LABELS: Record<AlertAction, string> = {
  snooze: 'Snooze 5 min',
  pause: 'Pause',
  dismiss: 'Dismiss',
}

export function notificationIdFor(kind: SchedulableRecord['kind'], recordId: string): string {
  return `chronly-${kind}-${recordId}`
}

const NOTIFICATION_ID_PATTERN = /^chronly-(alarm|countdown|pomodoro)-(.+)$/

export function parseNotificationId(
  notificationId: string,
): { kind: SchedulableRecord['kind']; recordId: string } | null {
  const match = NOTIFICATION_ID_PATTERN.exec(notificationId)
  if (!match) return null
  return { kind: match[1] as SchedulableRecord['kind'], recordId: match[2]! }
}

function buttonsFor(kind: SchedulableRecord['kind']): { title: string }[] {
  return NOTIFICATION_ACTIONS[kind].map((action) => ({ title: ALERT_ACTION_LABELS[action] }))
}

export interface NotificationOptions {
  type: 'basic'
  title: string
  message: string
  iconUrl: string
  requireInteraction?: boolean
  buttons?: { title: string }[]
}

export interface NotificationSpec {
  notificationId: string
  options: NotificationOptions
}

const ICON_URL = '/icon-128.png'

/** Keyed on the phase union so adding a phase is a compile error here rather
 *  than a notification that reads "undefined complete." */
const POMODORO_PHASE_LABELS: Record<PomodoroRecord['phase'], string> = {
  focus: 'Focus session',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}

export function buildNotificationSpec(record: SchedulableRecord): NotificationSpec {
  const notificationId = notificationIdFor(record.kind, record.id)

  if (record.kind === 'alarm') {
    return {
      notificationId,
      options: {
        type: 'basic',
        title: record.label || 'Alarm',
        message: 'Your alarm is going off.',
        iconUrl: ICON_URL,
        requireInteraction: true,
        buttons: buttonsFor('alarm'),
      },
    }
  }

  if (record.kind === 'countdown') {
    return {
      notificationId,
      options: {
        type: 'basic',
        title: record.label || 'Timer',
        message: 'Your timer finished.',
        iconUrl: ICON_URL,
        requireInteraction: true,
        buttons: buttonsFor('countdown'),
      },
    }
  }

  if (record.kind === 'pomodoro') {
    return {
      notificationId,
      options: {
        type: 'basic',
        title: record.label || 'Pomodoro',
        message: `${POMODORO_PHASE_LABELS[record.phase]} complete.`,
        iconUrl: ICON_URL,
        requireInteraction: true,
        buttons: buttonsFor('pomodoro'),
      },
    }
  }

  const unhandled: never = record
  throw new Error(`Unsupported record kind: ${JSON.stringify(unhandled)}`)
}

/**
 * Firefox's notifications API supports neither `buttons` nor
 * `requireInteraction`, and rejects the call rather than ignoring them. Strip
 * them there so the notification itself still gets through — losing the
 * buttons degrades snooze/dismiss to opening the popup, losing the whole
 * notification would mean a silently missed alarm.
 */
export function toPlatformNotificationOptions(
  options: NotificationOptions,
  isFirefox: boolean = import.meta.env.BROWSER === 'firefox',
): NotificationOptions {
  if (!isFirefox) return options
  // Allowlist rather than deleting the two unsupported keys, so any option
  // added later has to be consciously opted into the Firefox path.
  return {
    type: options.type,
    title: options.title,
    message: options.message,
    iconUrl: options.iconUrl,
  }
}

export async function showNotification(spec: NotificationSpec): Promise<void> {
  await browser.notifications.create(spec.notificationId, toPlatformNotificationOptions(spec.options))
}
