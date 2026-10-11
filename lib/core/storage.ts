import { browser } from 'wxt/browser'
import type {
  ActiveAlert,
  CustomSound,
  PomodoroStats,
  SchedulableRecord,
  Settings,
  StopwatchState,
  WorldClockEntry,
} from './types'
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
const CUSTOM_SOUNDS_KEY = 'customSounds'

export type SettingsPatch = Omit<Partial<Settings>, 'background'> & {
  background?: Partial<Settings['background']>
}

/**
 * Run a read-modify-write under a lock shared by every extension context. The
 * popup and the background worker are separate realms that write the same
 * keys; Web Locks is the one primitive they share through the extension origin.
 */
function withLock<T>(name: string, mutation: () => Promise<T>): Promise<T> {
  return typeof navigator === 'undefined' || !navigator.locks ? mutation() : navigator.locks.request(name, mutation)
}

export class RecordStore {
  constructor(private backend: StorageBackend) {}

  private mutate<T>(mutation: () => Promise<T>): Promise<T> {
    return withLock(RECORDS_KEY, mutation)
  }

  async getAll(): Promise<SchedulableRecord[]> {
    const map = await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)
    return map ? Object.values(map) : []
  }

  async get(id: string): Promise<SchedulableRecord | undefined> {
    const map = await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)
    return map?.[id]
  }

  upsert(record: SchedulableRecord): Promise<void> {
    return this.mutate(async () => {
      const map = (await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)) ?? {}
      map[record.id] = record
      await this.backend.set(RECORDS_KEY, map)
    })
  }

  /**
   * Replace a record only if the snapshot used to derive the replacement is
   * still current. The background tick reads records, performs notification
   * work, and then writes them back; a popup can delete or edit one during
   * that gap. Refusing a stale replacement prevents the tick from resurrecting
   * deleted records or clobbering a user's edit.
   */
  async replaceIfCurrent(record: SchedulableRecord, expectedUpdatedAt: number): Promise<boolean> {
    return this.mutate(async () => {
      const map = await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)
      const current = map?.[record.id]
      if (!current || current.updatedAt !== expectedUpdatedAt) return false
      map[record.id] = record
      await this.backend.set(RECORDS_KEY, map)
      return true
    })
  }

  remove(id: string): Promise<void> {
    return this.mutate(async () => {
      const map = (await this.backend.get<Record<string, SchedulableRecord>>(RECORDS_KEY)) ?? {}
      delete map[id]
      await this.backend.set(RECORDS_KEY, map)
    })
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
  private writeChain = Promise.resolve()

  constructor(private backend: StorageBackend) {}

  async get(): Promise<Settings> {
    const stored = await this.backend.get<Settings>(SETTINGS_KEY)
    const background =
      stored?.background?.type === 'solid' || stored?.background?.type === 'gradient'
        ? stored.background
        : DEFAULT_SETTINGS.background
    return { ...DEFAULT_SETTINGS, ...stored, background }
  }

  update(patch: SettingsPatch): Promise<Settings> {
    const write = this.writeChain.then(async () => {
      const current = await this.get()
      const next: Settings = {
        ...current,
        ...patch,
        background: patch.background ? { ...current.background, ...patch.background } : current.background,
      }
      await this.backend.set(SETTINGS_KEY, next)
      return next
    })
    this.writeChain = write.then(
      () => undefined,
      () => undefined,
    )
    return write
  }
}

export class CustomSoundStore {
  private writeChain = Promise.resolve()

  constructor(private backend: StorageBackend) {}

  async getAll(): Promise<CustomSound[]> {
    return (await this.backend.get<CustomSound[]>(CUSTOM_SOUNDS_KEY)) ?? []
  }

  private update(change: (sounds: CustomSound[]) => CustomSound[]): Promise<void> {
    const write = this.writeChain.then(async () => {
      await this.backend.set(CUSTOM_SOUNDS_KEY, change(await this.getAll()))
    })
    this.writeChain = write.catch(() => undefined)
    return write
  }

  upsert(sound: CustomSound): Promise<void> {
    return this.update((sounds) => {
      const index = sounds.findIndex((item) => item.id === sound.id)
      if (index === -1) sounds.push(sound)
      else sounds[index] = sound
      return sounds
    })
  }

  remove(id: string): Promise<void> {
    return this.update((sounds) => sounds.filter((sound) => sound.id !== id))
  }
}

export type StorageAreaName = 'local' | 'sync' | 'session'

export function createExtensionStorageBackend(area: StorageAreaName): StorageBackend {
  // storage.session clears itself when the browser closes. Where it is missing
  // (older browsers) local storage stands in; callers that use it clear the key
  // on startup themselves.
  const storageArea = browser.storage[area] ?? browser.storage.local
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

/** Local calendar day, e.g. "2026-02-02" — the key focus stats are grouped by. */
export function localDayKey(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Enough history for a week view with room to spare, without growing forever. */
const FOCUS_HISTORY_DAYS = 31

export class PomodoroStatsStore {
  constructor(private backend: StorageBackend) {}

  async get(): Promise<PomodoroStats> {
    const stored = await this.backend.get<PomodoroStats>(POMODORO_STATS_KEY)
    return stored ?? DEFAULT_POMODORO_STATS
  }

  recordCompletedFocusSession(focusMs: number, at: number = Date.now()): Promise<PomodoroStats> {
    return withLock(POMODORO_STATS_KEY, async () => {
      const current = await this.get()
      const day = localDayKey(at)
      const daily = { ...current.daily }
      const today = daily[day] ?? { sessions: 0, focusMs: 0 }
      daily[day] = { sessions: today.sessions + 1, focusMs: today.focusMs + focusMs }
      const kept = Object.keys(daily).sort().slice(-FOCUS_HISTORY_DAYS)
      const next: PomodoroStats = {
        totalFocusSessionsCompleted: current.totalFocusSessionsCompleted + 1,
        totalFocusMs: current.totalFocusMs + focusMs,
        daily: Object.fromEntries(kept.map((key) => [key, daily[key]!])),
      }
      await this.backend.set(POMODORO_STATS_KEY, next)
      return next
    })
  }
}

export const ACTIVE_ALERTS_KEY = 'activeAlerts'

/**
 * Alerts that are ringing right now, keyed by record id. Lives in session
 * storage: a browser restart silences every sound, so nothing should survive it.
 */
export class ActiveAlertStore {
  constructor(private backend: StorageBackend) {}

  async getAll(): Promise<ActiveAlert[]> {
    const map = await this.backend.get<Record<string, ActiveAlert>>(ACTIVE_ALERTS_KEY)
    return map ? Object.values(map).sort((a, b) => a.firedAt - b.firedAt) : []
  }

  async get(recordId: string): Promise<ActiveAlert | undefined> {
    const map = await this.backend.get<Record<string, ActiveAlert>>(ACTIVE_ALERTS_KEY)
    return map?.[recordId]
  }

  add(alert: ActiveAlert): Promise<void> {
    return withLock(ACTIVE_ALERTS_KEY, async () => {
      const map = (await this.backend.get<Record<string, ActiveAlert>>(ACTIVE_ALERTS_KEY)) ?? {}
      map[alert.recordId] = alert
      await this.backend.set(ACTIVE_ALERTS_KEY, map)
    })
  }

  remove(recordId: string): Promise<void> {
    return withLock(ACTIVE_ALERTS_KEY, async () => {
      const map = await this.backend.get<Record<string, ActiveAlert>>(ACTIVE_ALERTS_KEY)
      if (!map?.[recordId]) return
      delete map[recordId]
      await this.backend.set(ACTIVE_ALERTS_KEY, map)
    })
  }

  clear(): Promise<void> {
    return withLock(ACTIVE_ALERTS_KEY, () => this.backend.remove(ACTIVE_ALERTS_KEY))
  }
}

export function watchStorageKey<T>(key: string, onChange: (value: T | undefined) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => {
    if (areaName !== 'local' && areaName !== 'sync' && areaName !== 'session') return
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
