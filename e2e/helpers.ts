import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'

/**
 * The slice of the extension APIs the specs reach into from the popup page.
 * Specs `declare const chrome: ChromeApi` and call it inside `page.evaluate`,
 * where the real `chrome` object exists.
 */
export interface ChromeApi {
  alarms: { getAll(): Promise<Array<{ name: string; scheduledTime: number }>> }
  notifications: { getAll(): Promise<Record<string, unknown>> }
  action: { getBadgeText(details: object): Promise<string> }
  storage: Record<'local' | 'sync' | 'session', StorageArea>
}

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

declare const chrome: ChromeApi

export const POPUP_SIZE = { width: 460, height: 640 }

/** Open the real popup page and wait until saved data has loaded. */
export async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage()
  await page.setViewportSize(POPUP_SIZE)
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByRole('tab', { name: 'Clock' })).toBeEnabled()
  return page
}

/** Switch to a tab and return its panel. */
export async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name, exact: true }).click()
  const panel = page.getByRole('tabpanel', { name, exact: true })
  await expect(panel).toBeVisible()
  return panel
}

export async function readStorage<T>(page: Page, area: 'local' | 'sync' | 'session', key: string): Promise<T> {
  return (await page.evaluate(
    async ([area, key]) => (await chrome.storage[area as 'local'].get(key as string))[key as string],
    [area, key] as const,
  )) as T
}

/** Records as the background worker sees them, keyed by id. */
export async function readRecords(page: Page): Promise<Array<Record<string, unknown>>> {
  return Object.values((await readStorage<Record<string, Record<string, unknown>>>(page, 'local', 'records')) ?? {})
}

/**
 * Write a record straight into storage, the way the popup's stores do, so a
 * spec can make something come due in seconds rather than at a whole minute.
 */
export async function seedRecord(page: Page, record: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (record) => {
    const { records = {} } = (await chrome.storage.local.get('records')) as { records?: Record<string, unknown> }
    await chrome.storage.local.set({ records: { ...records, [record.id as string]: record } })
  }, record)
}

const base = (kind: string, label: string, now: number) => ({
  id: `${kind}-e2e-${Math.random().toString(36).slice(2, 8)}`,
  kind,
  label,
  soundId: 'default',
  volume: 0.05,
  notified: false,
  createdAt: now,
  updatedAt: now,
})

/** A one-off alarm that rings `inMs` from now. */
export function dueAlarm(label: string, inMs: number, now = Date.now()) {
  return {
    ...base('alarm', label, now),
    targetTimestamp: now + inMs,
    recurrence: null,
    fullScreenTakeover: false,
    snoozedUntil: null,
    enabled: true,
  }
}

/** A Pomodoro whose focus phase ends `inMs` from now. */
export function duePomodoro(label: string, inMs: number, now = Date.now()) {
  return {
    ...base('pomodoro', label, now),
    phase: 'focus',
    cycleCount: 0,
    config: { focusMs: 25 * 60_000, shortBreakMs: 5 * 60_000, longBreakMs: 15 * 60_000, cyclesBeforeLongBreak: 4 },
    targetTimestamp: now + inMs,
    status: 'running',
    remainingMsAtPause: null,
  }
}

export async function notificationIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => Object.keys(await chrome.notifications.getAll()))
}

export async function recordAlarmNames(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await chrome.alarms.getAll()).map(({ name }) => name).filter((name) => name.startsWith('record:')),
  )
}

export async function badgeText(page: Page): Promise<string> {
  return page.evaluate(() => chrome.action.getBadgeText({}))
}
