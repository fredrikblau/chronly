import { readable } from 'svelte/store'
import { BackgroundImageStore, createExtensionStorageBackend, watchStorageKey } from '../core/storage'

const store = new BackgroundImageStore(createExtensionStorageBackend('local'))

export const backgroundImage = readable<string | undefined>(undefined, (set) => {
  void store.get().then(set)
  return watchStorageKey<string>('backgroundImage', set)
})

export const backgroundImageActions = {
  set: (dataUrl: string) => store.set(dataUrl),
  clear: () => store.remove(),
}
