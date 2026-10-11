import { expect } from '@playwright/test'
import { test } from './fixtures'
import { openPopup, openTab, readRecords } from './helpers'

test('opens on a live clock', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const clock = page.getByRole('tabpanel', { name: 'Clock' }).getByRole('timer')

  await expect(clock).toHaveText(/^\d\d:\d\d:\d\d$/)
  const first = await clock.textContent()
  await expect(clock).not.toHaveText(first!, { timeout: 3000 })
})

test('follows the 12-hour, seconds, and clock-face settings', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const settings = await openTab(page, 'Settings')
  await settings.getByRole('switch', { name: '12-hour clock' }).check()
  await settings.getByRole('switch', { name: 'Show seconds' }).uncheck()
  await settings.locator('label.option').filter({ hasText: 'Both' }).click()

  const overview = await openTab(page, 'Clock')
  await expect(overview.getByRole('timer')).toHaveText(/^\d{1,2}:\d\d(AM|PM)$/)
  await expect(overview.locator('svg.analog')).toBeVisible()

  await openTab(page, 'Settings')
  await page.getByRole('tabpanel', { name: 'Settings' }).locator('label.option').filter({ hasText: 'Analog' }).click()
  await openTab(page, 'Clock')
  await expect(overview.locator('svg.analog')).toBeVisible()
  await expect(overview.getByRole('timer')).toHaveCount(0)
})

test('starts a quick timer from the overview and lists it under Up next', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const overview = page.getByRole('tabpanel', { name: 'Clock' })

  await overview.getByRole('button', { name: 'Start a 5 minute timer' }).click()

  const item = overview.getByRole('button').filter({ hasText: '5 min timer' })
  await expect(item).toContainText(/[45]:\d\d/)
  expect((await readRecords(page)).map((r) => r.label)).toEqual(['5 min timer'])

  await item.click()
  await expect(page.getByRole('tab', { name: 'Timers' })).toHaveAttribute('aria-selected', 'true')
})

test('switches tabs with number keys and arrow keys, and remembers the last one', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)

  await page.keyboard.press('5')
  await expect(page.getByRole('tab', { name: 'World' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: 'World' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Focus' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Focus' })).toBeFocused()

  await page.close()
  const reopened = await openPopup(context, extensionId)
  await expect(reopened.getByRole('tab', { name: 'Focus' })).toHaveAttribute('aria-selected', 'true')
})
