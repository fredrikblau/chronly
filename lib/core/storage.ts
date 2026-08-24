import { browser } from 'wxt/browser'
import type { PomodoroStats, SchedulableRecord, Settings, StopwatchState, WorldClockEntry } from './types'
import { DEFAULT_POMODORO_STATS, DEFAULT_SETTINGS, DEFAULT_STOPWATCH } from './types'

export interface StorageBackend {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export function createMemoryStorageBackend(): StorageBackend {
  const map = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return map.get(key) as T | undefined
    },
    async set<T>(key: string, value: T) {
      map.set(key, value)
    },
    async remove(key: string) {
      map.delete(key)
    },
  }
}

const RECORDS_KEY = 'records'
const WORLD_CLOCKS_KEY = 'worldClocks'
const SETTINGS_KEY = 'settings'
const POMODORO_STATS_KEY = 'pomodoroStats'

export class RecordStore {
  constructor(private backend: StorageBackend) {}

  async getAll(): Promise<SchedulableRecord[]> {
    const map = await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)
    return map ? Object.values(map) : []
  }

  async get(id: string): Promise<SchedulableRecord | undefined> {
    const map = await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)
    return map?.[id]
  }

  async upsert(record: SchedulableRecord): Promise<void> {
    const map = (await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)) ?? {}
    map[record.id] = record
    await this.backend.set(RECORDS_KEY, map)
  }

  /**
   * Replace a record only if the snapshot used to derive the replacement is
   * still current. The background tick reads records, performs notification
   * work, and then writes them back; a popup can delete or edit one during
   * that gap. Refusing a stale replacement prevents the tick from resurrecting
   * deleted records or clobbering a user's edit.
   */
  async replaceIfCurrent(record: SchedulableRecord, expectedUpdatedAt: number): Promise<boolean> {
    const map = await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)
    const current = map?.[record.id]
    if (!current || current.updatedAt !== expectedUpdatedAt) return false
    map[record.id] = record
    await this.backend.set(RECORDS_KEY, map)
    return true
  }

  async remove(id: string): Promise<void> {
    const map = (await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)) ?? {}
    delete map[id]
    await this.backend.set(RECORDS_KEY, map)
  }
}

export class WorldClockStore {
  constructor(private backend: StorageBackend) {}

  async getAll(): Promise<WorldClockEntry[]> {
    const list = await this.backend.get<WorldClockEntry[]>(WORLD_CLOCKS_KEY)
    return (list ?? []).slice().sort((a, b) => a.order - b.order)
  }

  async upsert(entry: WorldClockEntry): Promise<void> {
    const list = (await this.backend.get<WorldClockEntry[]>(WORLD_CLOCKS_KEY)) ?? []
    const idx = list.findIndex((e) => e.id === entry.id)
    if (idx === -1) list.push(entry)
    else list[idx] = entry
    await this.backend.set(WORLD_CLOCKS_KEY, list)
  }

  async remove(id: string): Promise<void> {
    const list = (await this.backend.get<WorldClockEntry[]>(WORLD_CLOCKS_KEY)) ?? []
    await this.backend.set(
      WORLD_CLOCKS_KEY,
      list.filter((e) => e.id !== id),
    )
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const list = (await this.backend.get<WorldClockEntry[]>(WORLD_CLOCKS_KEY)) ?? []
    const byId = new Map(list.map((e) => [e.id, e]))
    const reordered = orderedIds
      .map((id, index) => {
        const entry = byId.get(id)
        return entry ? { ...entry, order: index } : undefined
      })
      .filter((e): e is WorldClockEntry => e !== undefined)
    await this.backend.set(WORLD_CLOCKS_KEY, reordered)
  }
}

export class SettingsStore {
  constructor(private backend: StorageBackend) {}

  async get(): Promise<Settings> {
    const stored = await this.backend.get<Settings>(SETTINGS_KEY)
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const current = await this.get()
    const next = { ...current, ...patch }
    await this.backend.set(SETTINGS_KEY, next)
    return next
  }
}

export function createExtensionStorageBackend(area: 'local' | 'sync'): StorageBackend {
  const storageArea = browser.storage[area]
  return {
    async get<T>(key: string) {
      const result = await storageArea.get(key)
      return result[key] as T | undefined
    },
    async set<T>(key: string, value: T) {
      await storageArea.set({ [key]: value })
    },
    async remove(key: string) {
      await storageArea.remove(key)
    },
  }
}

export class PomodoroStatsStore {
  constructor(private backend: StorageBackend) {}

  async get(): Promise<PomodoroStats> {
    const stored = await this.backend.get<PomodoroStats>(POMODORO_STATS_KEY)
    return stored ?? DEFAULT_POMODORO_STATS
  }

  async recordCompletedFocusSession(focusMs: number): Promise<PomodoroStats> {
    const current = await this.get()
    const next: PomodoroStats = {
      totalFocusSessionsCompleted: current.totalFocusSessionsCompleted + 1,
      totalFocusMs: current.totalFocusMs + focusMs,
    }
    await this.backend.set(POMODORO_STATS_KEY, next)
    return next
  }
}

export function watchStorageKey<T>(
  key: string,
  onChange: (value: T | undefined) => void,
): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'local' && areaName !== 'sync') return
    const change = changes[key]
    if (change) onChange(change.newValue as T | undefined)
  }
  browser.storage.onChanged.addListener(listener)
  return () => browser.storage.onChanged.removeListener(listener)
}

const STOPWATCH_KEY = 'stopwatch'

/**
 * A single object under its own key, like SettingsStore — there is only ever one
 * stopwatch, and it is not a SchedulableRecord, so it never enters the records
 * map the background worker scans.
 */
export class StopwatchStore {
  constructor(private backend: StorageBackend) {}

  async get(): Promise<StopwatchState> {
    const stored = await this.backend.get<StopwatchState>(STOPWATCH_KEY)
    return stored ?? DEFAULT_STOPWATCH
  }

  async set(state: StopwatchState): Promise<void> {
    await this.backend.set(STOPWATCH_KEY, state)
  }
}
