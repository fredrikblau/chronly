import { describe, expect, it } from 'vitest'
import { buildAlertActionMessage, isAlertActionMessage } from './alerts'

describe('isAlertActionMessage', () => {
  it('accepts a message built for the background', () => {
    expect(isAlertActionMessage(buildAlertActionMessage('alarm-1', 'snooze'))).toBe(true)
  })

  it('ignores the offscreen sound messages that share the channel', () => {
    expect(isAlertActionMessage({ target: 'offscreen', type: 'stop-sound', playbackId: 'alarm-1' })).toBe(false)
  })

  it('rejects an unknown action', () => {
    expect(isAlertActionMessage({ target: 'background', type: 'alert-action', recordId: 'a', action: 'delete' })).toBe(
      false,
    )
  })

  it('rejects non-objects', () => {
    expect(isAlertActionMessage(null)).toBe(false)
    expect(isAlertActionMessage('alert-action')).toBe(false)
  })
})
