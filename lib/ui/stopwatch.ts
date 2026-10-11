import { readable } from 'svelte/store'
import { createExtensionStorageBackend, StopwatchStore, watchStorageKey } from '../core/storage'
import { DEFAULT_STOPWATCH, type StopwatchState } from '../core/types'

const store = new StopwatchStore(createExtensionStorageBackend('local'))

/**
 * A read-only view of the stopwatch for summaries such as the overview. The
 * stopwatch panel owns editing and its own load-gate bookkeeping.
 */
export const stopwatchSummary = readable<StopwatchState>(DEFAULT_STOPWATCH, (set) => {
  store.get().then(set, () => undefined)
  return watchStorageKey<StopwatchState>('stopwatch', (value) => set(value ?? DEFAULT_STOPWATCH))
})
