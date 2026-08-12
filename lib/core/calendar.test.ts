import { describe, expect, it } from 'vitest'
import { buildGoogleCalendarLink, buildIcs } from './calendar'

const event = {
  title: 'Chronly alarm: Wake up',
  start: new Date('2026-02-02T07:00:00.000Z'),
  end: new Date('2026-02-02T07:05:00.000Z'),
  description: 'Created by Chronly',
}

describe('buildGoogleCalendarLink', () => {
  it('builds a calendar.google.com render link with encoded event params', () => {
    const link = buildGoogleCalendarLink(event)
    expect(link.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    expect(link).toContain('action=TEMPLATE')
    expect(link).toContain('text=Chronly+alarm%3A+Wake+up')
    expect(link).toContain('dates=20260202T070000Z%2F20260202T070500Z')
  })
})

describe('buildIcs', () => {
  it('produces a valid VCALENDAR block with matching start/end', () => {
    const ics = buildIcs(event)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20260202T070000Z')
    expect(ics).toContain('DTEND:20260202T070500Z')
    expect(ics).toContain('SUMMARY:Chronly alarm: Wake up')
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('escapes characters that are structural in ICS text values', () => {
    const ics = buildIcs({
      ...event,
      title: 'Standup; then coffee, tea \\ juice',
      description: 'Line one\nLine two',
    })
    expect(ics).toContain('SUMMARY:Standup\\; then coffee\\, tea \\\\ juice')
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two')
  })

  it('escapes a bare carriage return as a line break too', () => {
    const ics = buildIcs({ ...event, description: 'One\rTwo' })
    expect(ics).toContain('DESCRIPTION:One\\nTwo')
  })

  it('separates lines with CRLF and terminates the object', () => {
    const ics = buildIcs(event)
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})
