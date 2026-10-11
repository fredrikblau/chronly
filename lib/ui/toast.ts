import { get, writable } from 'svelte/store'

/**
 * One short message at the bottom of the popup, optionally with an action.
 * Deleting is instant in Chronly, so every delete offers Undo here rather
 * than asking "Are you sure?" first.
 */
export interface Toast {
  id: number
  message: string
  actionLabel?: string
  action?: () => Promise<void> | void
  durationMs: number
}

export const TOAST_MS = 6000

const store = writable<Toast | null>(null)
let nextId = 0
let timer: ReturnType<typeof setTimeout> | undefined

export const toast = { subscribe: store.subscribe }

export function showToast(
  message: string,
  options: { actionLabel?: string; action?: Toast['action']; durationMs?: number } = {},
): number {
  const id = ++nextId
  const durationMs = options.durationMs ?? TOAST_MS
  store.set({ id, message, actionLabel: options.actionLabel, action: options.action, durationMs })
  startTimer(id, durationMs)
  return id
}

function startTimer(id: number, durationMs: number): void {
  clearTimeout(timer)
  timer = setTimeout(() => dismissToast(id), durationMs)
}

/**
 * Keep the toast up while someone points at it or has focus inside it, so
 * nobody has to race the clock to reach Undo (WCAG 2.2.1).
 */
export function holdToast(): void {
  clearTimeout(timer)
}

/** Start the full countdown again once the pointer or focus leaves. */
export function releaseToast(): void {
  const current = get(store)
  if (current) startTimer(current.id, current.durationMs)
}

/** Hide the toast, or only the given one if a newer toast has replaced it. */
export function dismissToast(id?: number): void {
  if (id === undefined || get(store)?.id === id) clearTimeout(timer)
  store.update((current) => (id === undefined || current?.id === id ? null : current))
}

/** Report a delete with an Undo that puts the item back exactly as it was. */
export function offerUndo(message: string, restore: () => Promise<void>): number {
  return showToast(message, { actionLabel: 'Undo', action: restore })
}
