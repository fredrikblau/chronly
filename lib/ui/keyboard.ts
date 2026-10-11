/**
 * Whether a key press belongs to a text field. Popup-wide shortcuts step aside
 * then, so typing a "1" or pressing Ctrl+Z in a label does what it normally
 * does.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  return !['checkbox', 'radio', 'button', 'range', 'color', 'submit'].includes(target.type)
}
