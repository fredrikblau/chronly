export interface CalendarEvent {
  title: string
  start: Date
  end: Date
  description?: string
}

/** ICS timestamps are basic-format UTC: 20260202T070000Z. */
function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Escapes a TEXT value per RFC 5545 section 3.3.11. Backslash must be escaped
 * first so the escapes added below aren't themselves re-escaped. Labels come
 * straight from user input, so an unescaped comma or semicolon would otherwise
 * split the value and corrupt the event on import.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

export function buildGoogleCalendarLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsDate(event.start)}/${toIcsDate(event.end)}`,
    details: event.description ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildIcs(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chronly//Chronly Extension//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(event.start)}`,
    `DTEND:${toIcsDate(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : undefined,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => line !== undefined)
  return lines.join('\r\n') + '\r\n'
}
