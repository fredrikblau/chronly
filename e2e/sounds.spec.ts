import { expect } from '@playwright/test'
import { test } from './fixtures'
import { openPopup, openTab } from './helpers'

test('offers every bundled tone and previews one', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  const sound = alarms.getByRole('combobox', { name: 'Sound' })

  await expect(sound.locator('option')).toHaveCount(8)
  await sound.selectOption({ label: 'Crystal drops — Light, sparkling melody' })

  const cdp = await context.newCDPSession(page)
  await alarms.getByRole('button', { name: 'Play selected sound' }).click()
  await expect
    .poll(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets')
      return targetInfos.some((target) => target.url === `chrome-extension://${extensionId}/offscreen.html`)
    })
    .toBe(true)
  await expect(alarms.getByRole('alert')).toHaveCount(0)
})

test('imports, keeps, and removes a custom audio file', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  const sound = alarms.getByRole('combobox', { name: 'Sound' })

  await alarms.getByLabel('Import an audio file').setInputFiles({
    name: 'morning-bell.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('RIFF-fake-audio'),
  })
  await expect(sound.locator('option', { hasText: 'morning-bell' })).toBeAttached()
  await expect(sound).toHaveValue(/custom-/)

  // Imported sounds are shared by every panel and survive reopening.
  const reopened = await openPopup(context, extensionId)
  const timers = await openTab(reopened, 'Timers')
  const restored = timers.getByRole('combobox', { name: 'Sound' }).locator('option', { hasText: 'morning-bell' })
  await expect(restored).toBeAttached()
  await timers.getByRole('combobox', { name: 'Sound' }).selectOption((await restored.getAttribute('value'))!)
  await timers.getByRole('button', { name: 'Remove' }).click()
  await expect(restored).toHaveCount(0)

  await reopened.reload()
  const again = await openTab(reopened, 'Alarms')
  await expect(
    again.getByRole('combobox', { name: 'Sound' }).locator('option', { hasText: 'morning-bell' }),
  ).toHaveCount(0)
})

test('refuses a file that is not audio', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')

  await alarms.getByLabel('Import an audio file').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not audio'),
  })

  await expect(alarms.getByRole('alert')).toHaveText('Choose an audio file.')
})
