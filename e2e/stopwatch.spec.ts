import { expect } from '@playwright/test'
import { test } from './fixtures'
import { openPopup, openTab } from './helpers'

test('times laps, pauses, resumes, and resets', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const stopwatch = await openTab(page, 'Stopwatch')
  const display = stopwatch.getByRole('timer')
  await expect(display).toHaveText('00:00.00')

  await stopwatch.getByRole('button', { name: 'Start' }).click()
  await expect(display).not.toHaveText('00:00.00')
  await page.waitForTimeout(250)
  await stopwatch.getByRole('button', { name: 'Lap' }).click()
  await page.waitForTimeout(250)
  await stopwatch.getByRole('button', { name: 'Lap' }).click()
  const laps = stopwatch.getByRole('list', { name: 'Recorded laps' }).getByRole('listitem')
  await expect(laps).toHaveCount(2)

  await stopwatch.getByRole('button', { name: 'Pause' }).click()
  const paused = await display.textContent()
  await page.waitForTimeout(400)
  await expect(display).toHaveText(paused!)

  await stopwatch.getByRole('button', { name: 'Resume' }).click()
  await expect(display).not.toHaveText(paused!)

  await stopwatch.getByRole('button', { name: 'Pause' }).click()
  await stopwatch.getByRole('button', { name: 'Reset' }).click()
  await expect(display).toHaveText('00:00.00')
  await expect(laps).toHaveCount(0)
})

test('keeps running while the popup is closed', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const stopwatch = await openTab(page, 'Stopwatch')
  await stopwatch.getByRole('button', { name: 'Start' }).click()
  await page.close()

  await new Promise((resolve) => setTimeout(resolve, 1200))
  const reopened = await openPopup(context, extensionId)
  const display = (await openTab(reopened, 'Stopwatch')).getByRole('timer')

  await expect(display).toHaveText(/^00:0[1-9]\.\d\d$/)
})

test('answers to Space and L while its tab is open', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  // Straight after clicking the tab, focus is on the tab itself.
  const stopwatch = await openTab(page, 'Stopwatch')

  await page.keyboard.press('Space')
  await expect(stopwatch.getByRole('button', { name: 'Pause' })).toBeVisible()
  await page.keyboard.press('l')
  await expect(stopwatch.getByRole('list', { name: 'Recorded laps' }).getByRole('listitem')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(stopwatch.getByRole('button', { name: 'Resume' })).toBeVisible()
})

test('shows a running stopwatch on the overview', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const stopwatch = await openTab(page, 'Stopwatch')
  await stopwatch.getByRole('button', { name: 'Start' }).click()

  const overview = await openTab(page, 'Clock')
  const item = overview.getByRole('button').filter({ hasText: 'Stopwatch' })
  await expect(item).toContainText('Running')
  await item.click()
  await expect(page.getByRole('tab', { name: 'Stopwatch' })).toHaveAttribute('aria-selected', 'true')
})
