/**
 * Minimal stand-in for `wxt/browser`, enough to render the popup outside the
 * extension. Storage lives in memory and change events are dispatched the way
 * chrome.storage does, so the lib/ui stores behave normally.
 */
type Changes = Record<string, { newValue?: unknown }>
type Listener = (changes: Changes, areaName: string) => void

const listeners = new Set<Listener>()

function createArea(areaName: string) {
  const data = new Map<string, unknown>()
  return {
    async get(key: string): Promise<Record<string, unknown>> {
      return data.has(key) ? { [key]: data.get(key) } : {}
    },
    async set(items: Record<string, unknown>): Promise<void> {
      const changes: Changes = {}
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value)
        changes[key] = { newValue: value }
      }
      listeners.forEach((listener) => listener(changes, areaName))
    },
    async remove(key: string): Promise<void> {
      data.delete(key)
      listeners.forEach((listener) => listener({ [key]: {} }, areaName))
    },
  }
}

export const browser = {
  storage: {
    local: createArea('local'),
    sync: createArea('sync'),
    onChanged: {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    },
  },
  notifications: {
    async create(id: string): Promise<void> {
      console.info('[harness] notification', id)
    },
    async clear(): Promise<void> {},
  },
  runtime: {
    async getContexts(): Promise<unknown[]> {
      return []
    },
    async sendMessage(): Promise<void> {},
  },
  alarms: {
    async get(): Promise<undefined> {
      return undefined
    },
    async create(): Promise<void> {},
  },
}
