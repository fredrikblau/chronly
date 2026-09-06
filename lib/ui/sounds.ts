import { readable } from 'svelte/store'
import { createExtensionStorageBackend, CustomSoundStore, watchStorageKey } from '../core/storage'
import type { CustomSound } from '../core/types'
import { loadStorage } from './storageLoad'

const store = new CustomSoundStore(createExtensionStorageBackend('local'))

export const customSounds = readable<CustomSound[]>([], (set) => {
  loadStorage('custom sounds', store.getAll(), set)
  return watchStorageKey<CustomSound[]>('customSounds', (value) => set(value ?? []))
})

export const soundActions = {
  upsert: (sound: CustomSound) => store.upsert(sound),
  remove: (id: string) => store.remove(id),
}
