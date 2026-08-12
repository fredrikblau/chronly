import { readable } from 'svelte/store'

/**
 * A foreground render clock. It carries no authority over when anything fires —
 * the background worker owns that — it only drives smooth re-rendering while a
 * view is open.
 */
export function createNowStore(intervalMs = 250) {
  return readable(Date.now(), (set) => {
    const id = setInterval(() => set(Date.now()), intervalMs)
    return () => clearInterval(id)
  })
}
