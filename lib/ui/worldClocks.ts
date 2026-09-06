import { readable } from 'svelte/store'
import { createExtensionStorageBackend, watchStorageKey, WorldClockStore } from '../core/storage'
import type { WorldClockEntry } from '../core/types'
import { loadStorage } from './storageLoad'

const store = new WorldClockStore(createExtensionStorageBackend('sync'))

export const worldClocks = readable<WorldClockEntry[]>([], (set) => {
  loadStorage('world clocks', store.getAll(), set)
  return watchStorageKey<WorldClockEntry[]>('worldClocks', (value) =>
    set((value ?? []).slice().sort((a, b) => a.order - b.order)),
  )
})

export const worldClockActions = {
  upsert: (entry: WorldClockEntry) => store.upsert(entry),
  remove: (id: string) => store.remove(id),
  reorder: (orderedIds: string[]) => store.reorder(orderedIds),
}
