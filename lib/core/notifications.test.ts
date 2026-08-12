import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAlarm, createCountdown, createPomodoro } from './scheduler'
import { buildNotificationSpec, showNotification } from './notifications'
import type { PomodoroConfig } from './types'

const NOW = 1_770_000_000_000

describe('buildNotificationSpec', () => {
  it('builds a snooze/dismiss notification for an alarm', () => {
    const alarm = createAlarm('Wake up', NOW, NOW)
    const spec = buildNotificationSpec(alarm)
    expect(spec.notificationId).toBe(`chronly-alarm-${alarm.id}`)
    expect(spec.options.title).toBe('Wake up')
    expect(spec.options.requireInteraction).toBe(true)
    expect(spec.options.buttons?.map((b) => b.title)).toEqual(['Snooze 5 min', 'Dismiss'])
  })

  it('builds a dismiss-only notification for a countdown', () => {
    const countdown = createCountdown('Tea', 60_000, NOW)
    const spec = buildNotificationSpec(countdown)
    expect(spec.options.buttons?.map((b) => b.title)).toEqual(['Dismiss'])
  })

  it('describes the completed phase for a pomodoro', () => {
    const config: PomodoroConfig = {
      focusMs: 1000,
      shortBreakMs: 500,
      longBreakMs: 2000,
      cyclesBeforeLongBreak: 4,
    }
    const pomodoro = createPomodoro('Deep work', config, NOW)
    const spec = buildNotificationSpec(pomodoro)
    expect(spec.options.message).toBe('Focus session complete.')
  })

  it('falls back to a generic title when the record has no label', () => {
    expect(buildNotificationSpec(createAlarm('', NOW, NOW)).options.title).toBe('Alarm')
    expect(buildNotificationSpec(createCountdown('', 60_000, NOW)).options.title).toBe('Timer')
  })
})

describe('showNotification', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('calls browser.notifications.create with the spec', async () => {
    const create = vi.spyOn(fakeBrowser.notifications, 'create')
    const alarm = createAlarm('Wake up', NOW, NOW)
    const spec = buildNotificationSpec(alarm)
    await showNotification(spec)
    expect(create).toHaveBeenCalledWith(spec.notificationId, spec.options)
  })
})
