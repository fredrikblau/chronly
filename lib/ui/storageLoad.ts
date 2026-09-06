import { writable } from 'svelte/store'

const SOURCES = ['records', 'settings', 'custom sounds', 'world clocks', 'Pomodoro stats', 'stopwatch'] as const
type StorageLoadSource = (typeof SOURCES)[number]
export type StorageLoadState = 'loading' | 'ready' | 'error'

const state = writable<StorageLoadState>('loading')
const pending = new Set<StorageLoadSource>(SOURCES)
let failed = false

export const storageLoadState = { subscribe: state.subscribe }

export function beginStorageLoad(): void {
  pending.clear()
  SOURCES.forEach((source) => pending.add(source))
  failed = false
  state.set('loading')
}

export function finishStorageLoad(source: StorageLoadSource): void {
  pending.delete(source)
  if (!failed && pending.size === 0) state.set('ready')
}

export function failStorageLoad(source: StorageLoadSource, error: unknown): void {
  pending.delete(source)
  failed = true
  console.warn(`[chronly] could not load ${source}`, error)
  state.set('error')
}

export function loadStorage<T>(source: StorageLoadSource, read: Promise<T>, use: (value: T) => void): void {
  void read.then(
    (value) => {
      use(value)
      finishStorageLoad(source)
    },
    (error: unknown) => failStorageLoad(source, error),
  )
}
