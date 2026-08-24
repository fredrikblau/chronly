import { expect } from '@playwright/test'
import { test } from './fixtures'

test('popup shows a live clock and can create an alarm', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  // The clock panel is the default tab; its digital readout carries role="timer".
  await expect(page.getByRole('tabpanel', { name: 'Clock' }).getByRole('timer')).toBeVisible()

  await page.getByRole('tab', { name: 'Alarms' }).click()

  const alarms = page.getByRole('tabpanel', { name: 'Alarms' })
  await expect(alarms).toBeVisible()

  await alarms.getByPlaceholder('Label').fill('Smoke test alarm')
  // `exact` matters: each saved alarm row also has an "Add alarm <label> to
  // Google Calendar" button, which a substring match would collide with.
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()

  // The row renders once the record round-trips through extension storage.
  await expect(alarms.getByRole('listitem').filter({ hasText: 'Smoke test alarm' })).toBeVisible()
})

test('settings can build a custom background and pick its accent', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await page.getByRole('tab', { name: 'Settings' }).click()
  const settings = page.getByRole('tabpanel', { name: 'Settings' })

  await settings.locator('label.option').filter({ hasText: 'Dark' }).click()
  await settings.getByLabel('Start').fill('#112233')
  await settings.getByLabel('End').fill('#aabbcc')
  await settings.getByLabel('Angle').fill('45')
  await settings.getByRole('button', { name: 'Apply custom gradient' }).click()
  await settings.getByRole('button', { name: 'Auto-pick accent from background' }).click()

  await expect(settings.getByRole('button', { name: 'Auto-pick accent from background' })).toBeVisible()
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.style.getPropertyValue('--bg')))
    .toContain('linear-gradient')
})
