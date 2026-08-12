import { browser } from 'wxt/browser'
import type { SchedulableRecord } from './types'

export interface NotificationSpec {
  notificationId: string
  options: {
    type: 'basic'
    title: string
    message: string
    iconUrl: string
    requireInteraction: boolean
    buttons?: { title: string }[]
  }
}

const ICON_URL = '/icon-128.png'

const POMODORO_PHASE_LABELS: Record<string, string> = {
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

export async function showNotification(spec: NotificationSpec): Promise<void> {
  await browser.notifications.create(spec.notificationId, spec.options)
}
