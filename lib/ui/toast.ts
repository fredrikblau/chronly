import { writable } from 'svelte/store'

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
  clearTimeout(timer)
  store.set({ id, message, actionLabel: options.actionLabel, action: options.action })
  timer = setTimeout(() => dismissToast(id), options.durationMs ?? TOAST_MS)
  return id
}

/** Hide the toast, or only the given one if a newer toast has replaced it. */
export function dismissToast(id?: number): void {
  store.update((current) => (id === undefined || current?.id === id ? null : current))
}

/** Report a delete with an Undo that puts the item back exactly as it was. */
export function offerUndo(message: string, restore: () => Promise<void>): number {
  return showToast(message, { actionLabel: 'Undo', action: restore })
}
