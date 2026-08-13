import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadIcs, openGoogleCalendarLink } from './calendarAction'

const START = new Date('2026-02-02T07:00:00.000Z')
const END = new Date('2026-02-02T07:05:00.000Z')

describe('openGoogleCalendarLink', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens the built Google Calendar link in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    openGoogleCalendarLink('Wake up', START, END)

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('https://calendar.google.com/calendar/render?'),
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('carries the title, window and description into the link', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    openGoogleCalendarLink('Wake up', START, END, 'Chronly alarm')

    const params = new URL(open.mock.calls[0]?.[0] as string).searchParams
    expect(params.get('text')).toBe('Wake up')
    expect(params.get('dates')).toBe('20260202T070000Z/20260202T070500Z')
    expect(params.get('details')).toBe('Chronly alarm')
  })
})

describe('downloadIcs', () => {
  let clicked: { href: string; download: string } | null = null
  let createObjectURL: ReturnType<typeof vi.spyOn>
  let revokeObjectURL: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    clicked = null
    createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chronly-test')
    revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    // jsdom would try to navigate on a real anchor click, so the click itself is
    // the boundary that gets mocked; the anchor is otherwise a real element.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = { href: this.href, download: this.download }
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('clicks a download anchor pointing at the generated object URL', () => {
    downloadIcs('Wake up', START, END)

    expect(clicked).toEqual({ href: 'blob:chronly-test', download: 'wake-up.ics' })
  })

  it('hands the .ics text to the blob as a calendar file', async () => {
    downloadIcs('Wake up', START, END, 'Chronly alarm')

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('text/calendar')
    const text = await blob.text()
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('SUMMARY:Wake up')
    expect(text).toContain('DTSTART:20260202T070000Z')
    expect(text).toContain('DTEND:20260202T070500Z')
    expect(text).toContain('DESCRIPTION:Chronly alarm')
  })

  it('falls back to a generic filename when the label has no usable characters', () => {
    downloadIcs('***', START, END)

    expect(clicked?.download).toBe('chronly-event.ics')
  })

  it('leaves no anchor behind and releases the object URL', () => {
    downloadIcs('Wake up', START, END)

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:chronly-test')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
