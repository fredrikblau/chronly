import { describe, expect, it } from 'vitest'
import { createAlarm, disableAlarm, snoozeAlarm } from './scheduler'
import { describeWhen, toolbarTitle } from './toolbar'
import type { ActiveAlert } from './types'

// 2026-02-02 is a Monday in local time.
const MONDAY_6AM = new Date(2026, 1, 2, 6, 0).getTime()
const at = (day: number, hour: number, minute = 0) => new Date(2026, 1, day, hour, minute).getTime()

const ringing = (title: string): ActiveAlert => ({
  recordId: title,
  kind: 'alarm',
  notificationId: `chronly-alarm-${title}`,
  title,
  message: 'Your alarm is going off.',
  firedAt: MONDAY_6AM,
})

describe('describeWhen', () => {
  it('says today, tomorrow, a weekday, or a date', () => {
    expect(describeWhen(at(2, 7), MONDAY_6AM, { locale: 'en-GB' })).toBe('today 07:00')
    expect(describeWhen(at(3, 7), MONDAY_6AM, { locale: 'en-GB' })).toBe('tomorrow 07:00')
    expect(describeWhen(at(5, 18, 30), MONDAY_6AM, { locale: 'en-GB' })).toBe('Thu 18:30')
    expect(describeWhen(at(12, 9), MONDAY_6AM, { locale: 'en-GB' })).toBe('12 Feb 09:00')
  })
})

describe('describeWhen with a clock preference', () => {
  it("follows the user's 12-hour preference", () => {
    expect(describeWhen(at(2, 19, 5), MONDAY_6AM, { locale: 'en-US', hour12: true })).toBe('today 07:05 PM')
    expect(describeWhen(at(2, 19, 5), MONDAY_6AM, { locale: 'en-US' })).toBe('today 19:05')
  })
})

describe('toolbarTitle', () => {
  it('is just the name when nothing is set', () => {
    expect(toolbarTitle([], [], MONDAY_6AM)).toBe('Chronly')
  })

  it('names the next armed alarm', () => {
    const records = [
      createAlarm('Gym', at(2, 18), MONDAY_6AM),
      createAlarm('Wake up', at(3, 7), MONDAY_6AM),
      disableAlarm(createAlarm('Muted', at(2, 6, 30), MONDAY_6AM), MONDAY_6AM),
    ]
    expect(toolbarTitle([], records, MONDAY_6AM, { locale: 'en-GB' })).toBe('Chronly — next alarm today 18:00 (Gym)')
  })

  it('follows a snooze rather than the original time', () => {
    const snoozed = snoozeAlarm(createAlarm('Wake up', at(2, 5), MONDAY_6AM), MONDAY_6AM)
    expect(toolbarTitle([], [snoozed], MONDAY_6AM, { locale: 'en-GB' })).toBe(
      'Chronly — next alarm today 06:05 (Wake up)',
    )
  })

  it('puts a ringing alert first', () => {
    const records = [createAlarm('Gym', at(2, 18), MONDAY_6AM)]
    expect(toolbarTitle([ringing('Tea'), ringing('Standup')], records, MONDAY_6AM)).toBe(
      'Chronly — Tea is ringing (+1 more)',
    )
  })
})
