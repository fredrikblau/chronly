import { buildGoogleCalendarLink, buildIcs } from '../core/calendar'

/**
 * Zero-permission calendar hand-off. Both paths stay inside the extension page:
 * the Google route is an ordinary pre-filled template URL and the .ics route is
 * a locally generated file, so neither needs a host permission, an OAuth token,
 * or a network call of our own.
 */

/** Turns a user-typed label into a safe, readable download filename. */
function filenameFor(title: string): string {
  const slug = title
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `${slug || 'chronly-event'}.ics`
}

export function openGoogleCalendarLink(title: string, start: Date, end: Date, description?: string): void {
  const link = buildGoogleCalendarLink({ title, start, end, description })
  // noopener keeps the new tab from reaching back into the popup via opener.
  window.open(link, '_blank', 'noopener,noreferrer')
}

export function downloadIcs(title: string, start: Date, end: Date, description?: string): void {
  const blob = new Blob([buildIcs({ title, start, end, description })], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filenameFor(title)
  // Firefox only dispatches the download for an anchor that is in the document,
  // so it is attached for the click and removed straight after.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
