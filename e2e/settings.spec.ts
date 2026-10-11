import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'
import { openPopup, openTab, readRecords, readStorage } from './helpers'

const rootStyle = (page: Page, property: string) =>
  page.evaluate((name) => document.documentElement.style.getPropertyValue(name), property)

test('switches between light and dark themes', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const settings = await openTab(page, 'Settings')
  const app = page.locator('.app')

  await settings.locator('label.option').filter({ hasText: 'Light' }).click()
  await expect(app).toHaveAttribute('data-surface', 'light')
  await expect.poll(() => rootStyle(page, '--bg')).toBe('#f6f6f9')

  await settings.locator('label.option').filter({ hasText: 'Dark' }).click()
  await expect(app).toHaveAttribute('data-surface', 'dark')
  await expect.poll(() => rootStyle(page, '--bg')).toBe('#0b0b0f')
})

test('paints a picked background whatever the theme, with readable text', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const settings = await openTab(page, 'Settings')
  await settings.locator('label.option').filter({ hasText: 'Dark' }).click()

  // Sunset is a light gradient: picking it under the dark theme must still
  // paint it, with the palette switched to dark text.
  await settings.getByRole('button', { name: 'Sunset' }).click()
  await expect.poll(() => rootStyle(page, '--bg')).toContain('#ff7e5f')
  await expect(page.locator('.app')).toHaveAttribute('data-surface', 'light')

  await settings.getByRole('button', { name: 'Default background' }).click()
  await expect.poll(() => rootStyle(page, '--bg')).toBe('#0b0b0f')
  await expect(page.locator('.app')).toHaveAttribute('data-surface', 'dark')
})

test('builds a custom gradient and picks accents', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const settings = await openTab(page, 'Settings')

  await settings.getByText('Custom gradient', { exact: true }).click()
  await settings.getByLabel('Start').fill('#112233')
  await settings.getByLabel('End').fill('#334455')
  await settings.getByLabel('Angle').fill('45')
  await settings.getByRole('button', { name: 'Apply custom gradient' }).click()
  await expect.poll(() => rootStyle(page, '--bg')).toBe('linear-gradient(45deg, #112233, #334455)')

  await settings.getByRole('button', { name: 'Teal accent' }).click()
  await expect(page.locator('.app')).toHaveCSS('--accent', '#2bb3a0')

  await settings.getByRole('button', { name: 'Auto-pick accent from background' }).click()
  await expect(page.locator('.app')).toHaveCSS('--accent', '#223344')
})

test('scales text and honours reduced motion', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const settings = await openTab(page, 'Settings')

  await settings.getByLabel('Text size').fill('1.25')
  await expect.poll(() => rootStyle(page, '--font-scale')).toBe('1.25')

  await settings.getByRole('switch', { name: 'Reduce motion' }).check()
  await expect(page.locator('.app')).toHaveClass(/reduced-motion/)
  expect(await readStorage<{ reducedMotion: boolean }>(page, 'sync', 'settings')).toMatchObject({
    reducedMotion: true,
  })
})

test('exports a backup and imports it again', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  await alarms.getByPlaceholder('Label').fill('Backed up')
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()
  await expect(alarms.getByRole('listitem')).toHaveCount(1)

  const settings = await openTab(page, 'Settings')
  const downloadEvent = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Export' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/^chronly-backup-\d{4}-\d\d-\d\d\.json$/)
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(backup.alarms.map((alarm: { label: string }) => alarm.label)).toEqual(['Backed up'])

  // Delete the alarm, then bring it back from the file.
  await (await openTab(page, 'Alarms')).getByRole('button', { name: 'Delete alarm Backed up' }).click()
  await expect.poll(() => readRecords(page)).toEqual([])

  await openTab(page, 'Settings')
  await settings.getByLabel('Import a Chronly backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await expect(settings.getByText(/^Imported 1 alarms/)).toBeVisible()
  await expect.poll(async () => (await readRecords(page)).map((r) => r.label)).toEqual(['Backed up'])
})

test('links to the project', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const settings = await openTab(page, 'Settings')

  await expect(settings.getByRole('link', { name: 'Star on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/fredrikblau/chronly',
  )
  await expect(settings.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible()
})
