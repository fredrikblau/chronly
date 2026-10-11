import { chromium, expect, test, type Page } from '@playwright/test'
import { extensionIdOf } from '../../e2e/fixtures'

const EXTENSION_PATH = decodeURIComponent(new URL('../../.output/chrome-mv3', import.meta.url).pathname)
const OUT = decodeURIComponent(new URL('../../docs/assets/', import.meta.url).pathname)

// A tidy, fixed moment for every shot: 09:41 tomorrow (UTC), so the clocks read
// the same on every run and nothing scheduled is due while capturing.
const tomorrow = new Date()
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
tomorrow.setUTCHours(9, 41, 12, 0)
const NOW = tomorrow.getTime()

declare const chrome: { storage: Record<'local' | 'session', { set(items: object): Promise<void> }> }

async function shot(page: Page, name: string) {
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}${name}.png` })
}

async function tab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
  return page.getByRole('tabpanel', { name, exact: true })
}

test('capture README and store screenshots', async () => {
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: false,
    timezoneId: 'UTC',
    locale: 'en-US',
    deviceScaleFactor: 2,
    // Chronly is dark-first; the light shot switches theme explicitly.
    colorScheme: 'dark',
    viewport: { width: 460, height: 600 },
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  })
  const extensionId = await extensionIdOf(context)

  const page = await context.newPage()
  // setFixedTime freezes Date while leaving timers running, which Playwright's
  // own waiting relies on; a paused clock would stall every step.
  await page.clock.setFixedTime(NOW)
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByRole('tab', { name: 'Clock' })).toBeEnabled()

  // World clocks
  const world = await tab(page, 'World')
  for (const city of ['New York', 'London', 'Tokyo', 'San Francisco']) {
    await world.getByLabel('Time zone', { exact: true }).fill(city)
    await world.getByRole('button', { name: 'Add' }).click()
    await expect(world.getByRole('listitem').filter({ hasText: city })).toBeVisible()
  }

  // Alarms
  const alarms = await tab(page, 'Alarms')
  const addAlarm = async (time: string, label: string, preset?: string) => {
    await alarms.getByLabel('Time', { exact: true }).fill(time)
    if (preset) await alarms.getByRole('button', { name: preset, exact: true }).click()
    await alarms.getByPlaceholder('Label').fill(label)
    await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()
    await expect(alarms.getByRole('listitem').filter({ hasText: label })).toBeVisible()
  }
  await addAlarm('06:45', 'Wake up', 'Weekdays')
  await addAlarm('12:30', 'Lunch walk')
  await addAlarm('18:00', 'Gym', 'Weekends')
  await alarms.getByRole('switch', { name: 'Gym alarm' }).click()

  // Focus, with a week of history for the chart
  const days: Record<string, { sessions: number; focusMs: number }> = {}
  ;[3, 5, 2, 6, 4, 1, 3].forEach((sessions, i) => {
    const day = new Date(NOW - (6 - i) * 86_400_000)
    days[day.toISOString().slice(0, 10)] = { sessions, focusMs: sessions * 25 * 60_000 }
  })
  await page.evaluate(
    (daily) =>
      chrome.storage.local.set({
        pomodoroStats: { totalFocusSessionsCompleted: 86, totalFocusMs: 86 * 25 * 60_000, daily },
      }),
    days,
  )
  const focus = await tab(page, 'Focus')
  await focus.getByPlaceholder('Label').fill('Write the proposal')
  await focus.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.setFixedTime(NOW + 7 * 60_000 + 18_000)

  // Timers, started once the focus session is under way so both read mid-run.
  const timers = await tab(page, 'Timers')
  await timers.getByRole('button', { name: '3 minutes', exact: true }).click()
  await timers.getByPlaceholder('Label').fill('Tea')
  await timers.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.setFixedTime(NOW + 7 * 60_000 + 59_000)

  await tab(page, 'Clock')
  await shot(page, 'popup-screenshot')
  await tab(page, 'Alarms')
  await shot(page, 'alarms-screenshot')
  await tab(page, 'Focus')
  await shot(page, 'focus-screenshot')
  await tab(page, 'World')
  await world.getByRole('switch', { name: 'Plan a meeting time' }).check()
  await world.getByLabel('Meeting time', { exact: true }).fill('16:00')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await shot(page, 'world-screenshot')

  // A ringing alert, as the background would record it.
  await page.evaluate(
    (firedAt) =>
      chrome.storage.session.set({
        activeAlerts: {
          ring: {
            recordId: 'ring',
            kind: 'alarm',
            notificationId: 'chronly-alarm-ring',
            title: 'Standup',
            message: 'Your alarm is going off.',
            firedAt,
          },
        },
      }),
    NOW,
  )
  await tab(page, 'Clock')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.locator('.app').evaluate((app) => app.classList.add('reduced-motion'))
  await shot(page, 'ringing-screenshot')
  await page.evaluate(() => chrome.storage.session.set({ activeAlerts: {} }))

  const settings = await tab(page, 'Settings')
  await settings.locator('label.option').filter({ hasText: 'Light' }).click()
  await tab(page, 'Clock')
  await shot(page, 'light-screenshot')

  // The remaining panels, back in the dark theme. Captured last so the extra
  // timer and the stopwatch stay out of the overview shots above.
  await tab(page, 'Settings')
  await settings.locator('label.option').filter({ hasText: 'Dark' }).click()
  await shot(page, 'settings-screenshot')

  await tab(page, 'Timers')
  await timers.getByRole('button', { name: '10 minutes', exact: true }).click()
  await timers.getByPlaceholder('Label').fill('Pasta')
  await timers.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.setFixedTime(NOW + 9 * 60_000 + 35_000)
  await timers.getByRole('button', { name: 'Pause Pasta' }).click()
  await page.clock.setFixedTime(NOW + 9 * 60_000 + 50_000)
  await shot(page, 'timers-screenshot')

  const stopwatch = await tab(page, 'Stopwatch')
  const lapAt = async (offsetMs: number) => {
    await page.clock.setFixedTime(NOW + 10 * 60_000 + offsetMs)
    await stopwatch.getByRole('button', { name: 'Lap' }).click()
  }
  await page.clock.setFixedTime(NOW + 10 * 60_000)
  await stopwatch.getByRole('button', { name: 'Start' }).click()
  await lapAt(83_420)
  await lapAt(161_870)
  await lapAt(247_150)
  await lapAt(318_640)
  await page.clock.setFixedTime(NOW + 10 * 60_000 + 352_270)
  await shot(page, 'stopwatch-screenshot')

  await context.close()
})
