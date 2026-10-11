import type { AlertAction } from './notifications'

/**
 * The popup asks the background to act on a ringing alert rather than acting
 * itself: on Firefox the sound plays inside the background page, which only
 * the background can stop, and routing both browsers through one handler keeps
 * the banner and the notification buttons identical.
 */
export interface AlertActionMessage {
  target: 'background'
  type: 'alert-action'
  recordId: string
  action: AlertAction
}

const ACTIONS: readonly AlertAction[] = ['snooze', 'pause', 'dismiss']

export function buildAlertActionMessage(recordId: string, action: AlertAction): AlertActionMessage {
  return { target: 'background', type: 'alert-action', recordId, action }
}

/** `runtime.onMessage` hears every broadcast, so narrow a genuinely unknown value. */
export function isAlertActionMessage(message: unknown): message is AlertActionMessage {
  if (typeof message !== 'object' || message === null) return false
  const candidate = message as Partial<AlertActionMessage>
  return (
    candidate.target === 'background' &&
    candidate.type === 'alert-action' &&
    typeof candidate.recordId === 'string' &&
    ACTIONS.includes(candidate.action as AlertAction)
  )
}
