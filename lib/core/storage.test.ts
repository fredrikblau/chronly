import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createExtensionStorageBackend,
  createMemoryStorageBackend,
  CustomSoundStore,
  PomodoroStatsStore,
  RecordStore,
  SettingsStore,
  StopwatchStore,
  type StorageBackend,
  watchStorageKey,
  WorldClockStore,
} from './storage'
import {
  DEFAULT_POMODORO_STATS,
  DEFAULT_SETTINGS,
  DEFAULT_STOPWATCH,
  type AlarmRecord,
  type StopwatchState,
  type WorldClockEntry,
} from './types'

const sampleAlarm: AlarmRecord = {
  id: 'alarm-1',
  kind: 'alarm',
  label: 'Wake up',
  targetTimestamp: 1000,
  recurrence: null,
  fullScreenTakeover: false,
  snoozedUntil: null,
  soundId: 'default',
  volume: 0.8,
  notified: false,
  createdAt: 0,
  updatedAt: 0,
}

function installTestLockManager(): void {
  let chain = Promise.resolve()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request(name: string, callback: (lock: Lock) => unknown) {
        const result = chain.then(() => callback({ name, mode: 'exclusive' } as Lock))
        chain = result.then(
          () => undefined,
          () => undefined,
        )
        return result
      },
    },
  })
}

describe('RecordStore', () => {
  beforeEach(installTestLockManager)

  it('starts empty and returns undefined for unknown ids', async () => {
    const store = new RecordStore(createMemoryStorageBackend())
    expect(await store.getAll()).toEqual([])
    expect(await store.get('missing')).toBeUndefined()
  })

  it('upserts and retrieves a record by id', async () => {
    const store = new RecordStore(createMemoryStorageBackend())
    await store.upsert(sampleAlarm)
    expect(await store.get('alarm-1')).toEqual(sampleAlarm)
    expect(await store.getAll()).toEqual([sampleAlarm])
  })

  it('removes a record by id', async () => {
    const store = new RecordStore(createMemoryStorageBackend())
    await store.upsert(sampleAlarm)
    await store.remove('alarm-1')
    expect(await store.getAll()).toEqual([])
  })

  it('does not replace a record after it was changed or removed', async () => {
    const store = new RecordStore(createMemoryStorageBackend())
    await store.upsert(sampleAlarm)

    expect(await store.replaceIfCurrent({ ...sampleAlarm, label: 'Updated by tick' }, 1)).toBe(false)
    expect(await store.get(sampleAlarm.id)).toEqual(sampleAlarm)

    await store.remove(sampleAlarm.id)
    expect(await store.replaceIfCurrent(sampleAlarm, sampleAlarm.updatedAt)).toBe(false)
    expect(await store.get(sampleAlarm.id)).toBeUndefined()
  })

  it('preserves concurrent changes across store instances', async () => {
    const memory = createMemoryStorageBackend()
    const backend: StorageBackend = {
      async get<T>(key: string) {
        const value = await memory.get<T>(key)
        return value === undefined ? undefined : structuredClone(value)
      },
      set: (key, value) => memory.set(key, structuredClone(value)),
      remove: (key) => memory.remove(key),
    }
    const popup = new RecordStore(backend)
    const background = new RecordStore(backend)
    const second = { ...sampleAlarm, id: 'alarm-2', label: 'Second alarm' }
    await popup.upsert(sampleAlarm)

    await Promise.all([popup.upsert(second), background.remove(sampleAlarm.id)])

    expect(await popup.getAll()).toEqual([second])
  })

  it('does not resurrect a record deleted during background replacement', async () => {
    const memory = createMemoryStorageBackend()
    await memory.set('records', { [sampleAlarm.id]: sampleAlarm })
    let replacementStarted!: () => void
    let releaseReplacement!: () => void
    const started = new Promise<void>((resolve) => (replacementStarted = resolve))
    const release = new Promise<void>((resolve) => (releaseReplacement = resolve))
    const backend: StorageBackend = {
      async get<T>(key: string) {
        const value = await memory.get<T>(key)
        return value === undefined ? undefined : structuredClone(value)
      },
      async set(key, value) {
        const records = value as Record<string, AlarmRecord>
        if (records[sampleAlarm.id]?.label === 'Updated by tick') {
          replacementStarted()
          await release
        }
        await memory.set(key, structuredClone(value))
      },
      remove: (key) => memory.remove(key),
    }
    const background = new RecordStore(backend)
    const popup = new RecordStore(backend)
    const replacement = background.replaceIfCurrent({ ...sampleAlarm, label: 'Updated by tick' }, sampleAlarm.updatedAt)
    await started
    const removal = popup.remove(sampleAlarm.id)

    await new Promise((resolve) => setTimeout(resolve, 0))
    releaseReplacement()
    await Promise.all([replacement, removal])

    expect(await popup.get(sampleAlarm.id)).toBeUndefined()
  })
})

describe('WorldClockStore', () => {
  const nyc: WorldClockEntry = { id: 'nyc', timeZone: 'America/New_York', label: 'NYC', color: '#fff', order: 1 }
  const tokyo: WorldClockEntry = { id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo', color: '#000', order: 0 }

  it('returns entries sorted by order', async () => {
    const store = new WorldClockStore(createMemoryStorageBackend())
    await store.upsert(nyc)
    await store.upsert(tokyo)
    expect((await store.getAll()).map((e) => e.id)).toEqual(['tokyo', 'nyc'])
  })

  it('reorders entries by id list', async () => {
    const store = new WorldClockStore(createMemoryStorageBackend())
    await store.upsert(nyc)
    await store.upsert(tokyo)
    await store.reorder(['nyc', 'tokyo'])
    expect((await store.getAll()).map((e) => e.id)).toEqual(['nyc', 'tokyo'])
  })

  it('removes an entry by id', async () => {
    const store = new WorldClockStore(createMemoryStorageBackend())
    await store.upsert(nyc)
    await store.remove('nyc')
    expect(await store.getAll()).toEqual([])
  })
})

describe('SettingsStore', () => {
  it('returns defaults when nothing is stored', async () => {
    const store = new SettingsStore(createMemoryStorageBackend())
    expect(await store.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('merges a partial update over current settings', async () => {
    const store = new SettingsStore(createMemoryStorageBackend())
    const updated = await store.update({ theme: 'dark' })
    expect(updated.theme).toBe('dark')
    expect(updated.hour12).toBe(DEFAULT_SETTINGS.hour12)
    expect(await store.get()).toEqual(updated)
  })

  it('preserves concurrent settings updates', async () => {
    const store = new SettingsStore(createMemoryStorageBackend())

    await Promise.all([
      store.update({ theme: 'dark' }),
      store.update({ hour12: true }),
      store.update({ background: { accentColor: '#ffffff' } }),
    ])

    expect(await store.get()).toMatchObject({ theme: 'dark', hour12: true })
    expect((await store.get()).background).toEqual({ ...DEFAULT_SETTINGS.background, accentColor: '#ffffff' })
  })

  it('continues after a settings write fails', async () => {
    const memory = createMemoryStorageBackend()
    let rejectNextWrite = true
    const backend: StorageBackend = {
      ...memory,
      async set(key, value) {
        if (rejectNextWrite) {
          rejectNextWrite = false
          throw new Error('sync quota exceeded')
        }
        await memory.set(key, value)
      },
    }
    const store = new SettingsStore(backend)

    await expect(store.update({ theme: 'dark' })).rejects.toThrow('sync quota exceeded')
    await expect(store.update({ hour12: true })).resolves.toMatchObject({ hour12: true })
  })

  it('replaces a legacy image background that the popup cannot display', async () => {
    const backend = createMemoryStorageBackend()
    await backend.set('settings', {
      ...DEFAULT_SETTINGS,
      background: { type: 'image', value: 'https://example.test/bg.jpg', accentColor: '#ffffff' },
    })
    expect((await new SettingsStore(backend).get()).background).toEqual(DEFAULT_SETTINGS.background)
  })
})

describe('CustomSoundStore', () => {
  it('stores, updates, and removes imported sounds', async () => {
    const store = new CustomSoundStore(createMemoryStorageBackend())
    const sound = {
      id: 'custom-1',
      name: 'Bell',
      dataUrl: 'data:audio/ogg;base64,AAAA',
      mimeType: 'audio/ogg',
      createdAt: 1,
    }
    await store.upsert(sound)
    expect(await store.getAll()).toEqual([sound])
    await store.upsert({ ...sound, name: 'Bell updated' })
    expect((await store.getAll())[0]?.name).toBe('Bell updated')
    await store.remove(sound.id)
    expect(await store.getAll()).toEqual([])
  })

  it('preserves concurrent imported-sound changes', async () => {
    const memory = createMemoryStorageBackend()
    let rejectNextWrite = false
    const backend: StorageBackend = {
      async get<T>(key: string) {
        const value = await memory.get<T>(key)
        return value === undefined ? undefined : structuredClone(value)
      },
      async set(key, value) {
        if (rejectNextWrite) {
          rejectNextWrite = false
          throw new Error('storage unavailable')
        }
        await memory.set(key, structuredClone(value))
      },
      remove: (key) => memory.remove(key),
    }
    const store = new CustomSoundStore(backend)
    const first = {
      id: 'custom-1',
      name: 'Bell',
      dataUrl: 'data:audio/ogg;base64,AAAA',
      mimeType: 'audio/ogg',
      createdAt: 1,
    }
    const second = { ...first, id: 'custom-2', name: 'Chime' }
    await store.upsert(first)

    await Promise.all([store.upsert(second), store.remove(first.id)])

    expect(await store.getAll()).toEqual([second])

    rejectNextWrite = true
    await expect(store.remove(second.id)).rejects.toThrow('storage unavailable')
    await expect(store.remove(second.id)).resolves.toBeUndefined()
  })
})

describe('createExtensionStorageBackend', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('round-trips a value through browser.storage.local', async () => {
    const backend = createExtensionStorageBackend('local')
    await backend.set('records', { 'alarm-1': sampleAlarm })
    expect(await backend.get('records')).toEqual({ 'alarm-1': sampleAlarm })
  })

  it('removes a stored key', async () => {
    const backend = createExtensionStorageBackend('local')
    await backend.set('records', { 'alarm-1': sampleAlarm })
    await backend.remove('records')
    expect(await backend.get('records')).toBeUndefined()
  })
})

describe('PomodoroStatsStore', () => {
  it('starts at zero', async () => {
    const store = new PomodoroStatsStore(createMemoryStorageBackend())
    expect(await store.get()).toEqual(DEFAULT_POMODORO_STATS)
  })

  it('accumulates completed focus sessions', async () => {
    const store = new PomodoroStatsStore(createMemoryStorageBackend())
    await store.recordCompletedFocusSession(25 * 60_000)
    const stats = await store.recordCompletedFocusSession(25 * 60_000)
    expect(stats).toEqual({ totalFocusSessionsCompleted: 2, totalFocusMs: 50 * 60_000 })
  })
})

describe('watchStorageKey', () => {
  it('invokes the callback with the new value when the watched key changes', async () => {
    fakeBrowser.reset()
    const backend = createExtensionStorageBackend('local')
    const seen: unknown[] = []
    const unwatch = watchStorageKey<{ hello: string }>('greeting', (value) => seen.push(value))

    await backend.set('greeting', { hello: 'world' })
    // storage.onChanged fires asynchronously; flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(seen).toEqual([{ hello: 'world' }])
    unwatch()
  })

  it('ignores changes to other keys', async () => {
    fakeBrowser.reset()
    const backend = createExtensionStorageBackend('local')
    const seen: unknown[] = []
    const unwatch = watchStorageKey('greeting', (value) => seen.push(value))

    await backend.set('somethingElse', 1)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(seen).toEqual([])
    unwatch()
  })
})

describe('StopwatchStore', () => {
  it('returns the default idle state when nothing is stored', async () => {
    const store = new StopwatchStore(createMemoryStorageBackend())
    expect(await store.get()).toEqual(DEFAULT_STOPWATCH)
  })

  it('round-trips a set state', async () => {
    const store = new StopwatchStore(createMemoryStorageBackend())
    const state: StopwatchState = {
      status: 'running',
      startedAt: 1000,
      elapsedMsBeforeStart: 0,
      laps: [],
    }
    await store.set(state)
    expect(await store.get()).toEqual(state)
  })

  it('keeps a running state across store instances sharing a backend', async () => {
    const backend = createMemoryStorageBackend()
    await new StopwatchStore(backend).set({
      status: 'paused',
      startedAt: null,
      elapsedMsBeforeStart: 4200,
      laps: [1500, 1000],
    })
    expect(await new StopwatchStore(backend).get()).toEqual({
      status: 'paused',
      startedAt: null,
      elapsedMsBeforeStart: 4200,
      laps: [1500, 1000],
    })
  })
})
