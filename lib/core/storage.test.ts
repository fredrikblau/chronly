import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createExtensionStorageBackend,
  createMemoryStorageBackend,
  RecordStore,
  SettingsStore,
  WorldClockStore,
} from './storage'
import { DEFAULT_SETTINGS, type AlarmRecord, type WorldClockEntry } from './types'

const sampleAlarm: AlarmRecord = {
  id: 'alarm-1',
  kind: 'alarm',
  label: 'Wake up',
  targetTimestamp: 1000,
  recurrence: null,
  fullScreenTakeover: false,
  soundId: 'default',
  volume: 0.8,
  notified: false,
  createdAt: 0,
  updatedAt: 0,
}

describe('RecordStore', () => {
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
