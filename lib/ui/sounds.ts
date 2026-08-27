import { readable } from 'svelte/store'
import { createExtensionStorageBackend, CustomSoundStore, watchStorageKey } from '../core/storage'
import type { CustomSound } from '../core/types'

const store = new CustomSoundStore(createExtensionStorageBackend('local'))

export const customSounds = readable<CustomSound[]>([], (set) => {
  void store.getAll().then(set)
  return watchStorageKey<CustomSound[]>('customSounds', (value) => set(value ?? []))
})

export const soundActions = {
  upsert: (sound: CustomSound) => store.upsert(sound),
  remove: (id: string) => store.remove(id),
}
