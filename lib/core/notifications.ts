import { browser } from 'wxt/browser'
import type { PomodoroRecord, SchedulableRecord } from './types'

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
  const notificationId = `chronly-${record.kind}-${record.id}`

  if (record.kind === 'alarm') {
    return {
      notificationId,
      options: {
        type: 'basic',
        title: record.label || 'Alarm',
        message: 'Your alarm is going off.',
        iconUrl: ICON_URL,
        requireInteraction: true,
        buttons: [{ title: 'Snooze 5 min' }, { title: 'Dismiss' }],
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
        buttons: [{ title: 'Dismiss' }],
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
        // The next phase has already started automatically by the time this is
        // shown, so pausing is the only action left worth offering.
        buttons: [{ title: 'Pause' }],
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
