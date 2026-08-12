import { readable } from 'svelte/store'
import { createExtensionStorageBackend, RecordStore, watchStorageKey } from '../core/storage'
import type { SchedulableRecord } from '../core/types'

// Records always use 'local' storage — the same area entrypoints/background.ts
// reads from. There is no messaging protocol between the two; shared storage is
// the single source of truth.
const store = new RecordStore(createExtensionStorageBackend('local'))

export const records = readable<SchedulableRecord[]>([], (set) => {
  void store.getAll().then(set)
  return watchStorageKey<Record<string, SchedulableRecord>>('records', (value) => {
    set(value ? Object.values(value) : [])
  })
})

export const recordActions = {
  upsert: (record: SchedulableRecord) => store.upsert(record),
  remove: (id: string) => store.remove(id),
}
