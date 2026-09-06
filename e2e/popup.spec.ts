import { expect } from '@playwright/test'
import { test } from './fixtures'

declare const chrome: {
  alarms: { getAll(): Promise<Array<{ name: string }>> }
}

test('popup shows a live clock and can create an alarm', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  // The clock panel is the default tab; its digital readout carries role="timer".
  await expect(page.getByRole('tabpanel', { name: 'Clock' }).getByRole('timer')).toBeVisible()

  await page.getByRole('tab', { name: 'Alarms' }).click()

  const alarms = page.getByRole('tabpanel', { name: 'Alarms' })
  await expect(alarms).toBeVisible()

  const cdp = await context.newCDPSession(page)
  await alarms.getByRole('button', { name: 'Test', exact: true }).click()
  await expect
    .poll(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets')
      return targetInfos.some((target) => target.url === `chrome-extension://${extensionId}/offscreen.html`)
    })
    .toBe(true)

  await alarms.getByPlaceholder('Label').fill('Smoke test alarm')
  // `exact` matters: each saved alarm row also has an "Add alarm <label> to
  // Google Calendar" button, which a substring match would collide with.
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()

  // The row renders once the record round-trips through extension storage.
  await expect(alarms.getByRole('listitem').filter({ hasText: 'Smoke test alarm' })).toBeVisible()
})

test('alarm sound picker shows built-ins and imports a custom audio file', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.getByRole('tab', { name: 'Alarms' }).click()

  const alarms = page.getByRole('tabpanel', { name: 'Alarms' })
  const sound = alarms.locator('select[aria-label="Sound"]')
  await expect(sound).toBeVisible()
  await expect(sound.locator('option')).toHaveCount(8)

  await alarms.locator('input[type=file]').setInputFiles({
    name: 'morning-bell.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('RIFF-fake-audio'),
  })

  await expect(sound.locator('option', { hasText: 'morning-bell' })).toBeAttached()
  await expect(sound).toHaveValue(/custom-/)

  await page.reload()
  await page.getByRole('tab', { name: 'Alarms' }).click()
  await expect(alarms.locator('select[aria-label="Sound"] option', { hasText: 'morning-bell' })).toBeAttached()
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

test('scheduled data survives force-closing the MV3 service worker', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  const timers = page.getByRole('tab', { name: 'Timers' })
  await timers.click()
  const panel = page.getByRole('tabpanel', { name: 'Timers' })
  await panel.getByPlaceholder('Label').fill('Suspension test')
  await panel.getByRole('button', { name: '1 min' }).click()
  await panel.locator('form.new-timer').getByRole('button', { name: 'Start', exact: true }).click()
  const timer = panel.getByRole('listitem').filter({ hasText: 'Suspension test' })
  await expect(timer).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(async () => (await chrome.alarms.getAll()).some(({ name }) => name.startsWith('record:'))),
    )
    .toBe(true)

  const cdp = await context.newCDPSession(page)
  const { targetInfos } = await cdp.send('Target.getTargets')
  const worker = targetInfos.find(
    (target) => target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/background.js`,
  )
  if (!worker) throw new Error('Could not find the Chronly service-worker target')
  await cdp.send('Target.closeTarget', { targetId: worker.targetId })

  const reopened = await context.newPage()
  await reopened.goto(`chrome-extension://${extensionId}/popup.html`)
  await reopened.getByRole('tab', { name: 'Timers' }).click()
  const restored = reopened
    .getByRole('tabpanel', { name: 'Timers' })
    .getByRole('listitem')
    .filter({ hasText: 'Suspension test' })
  await expect(restored).toBeVisible()
  await restored.getByRole('button', { name: 'Delete Suspension test' }).click()
  await expect(restored).toHaveCount(0)
  await expect
    .poll(() =>
      reopened.evaluate(async () => (await chrome.alarms.getAll()).some(({ name }) => name.startsWith('record:'))),
    )
    .toBe(false)
})
