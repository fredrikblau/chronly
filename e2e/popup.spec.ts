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
