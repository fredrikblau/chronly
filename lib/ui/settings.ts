import { readable } from 'svelte/store'
import { createExtensionStorageBackend, SettingsStore, watchStorageKey } from '../core/storage'
import { DEFAULT_SETTINGS } from '../core/types'
import type { Settings } from '../core/types'

// Settings sync across devices — small, infrequently written.
const store = new SettingsStore(createExtensionStorageBackend('sync'))

export const settings = readable<Settings>(DEFAULT_SETTINGS, (set) => {
  void store.get().then(set)
  return watchStorageKey<Settings>('settings', (value) => set({ ...DEFAULT_SETTINGS, ...value }))
})

export const settingsActions = {
  update: (patch: Partial<Settings>) => store.update(patch),
}
