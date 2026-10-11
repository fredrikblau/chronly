import { expect } from '@playwright/test'
import { test } from './fixtures'
import { openPopup, openTab, readStorage } from './helpers'

test('adds cities by name, reorders and removes them', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const world = await openTab(page, 'World')
  const add = async (place: string) => {
    await world.getByLabel('Time zone', { exact: true }).fill(place)
    await world.getByRole('button', { name: 'Add' }).click()
  }

  await add('new york')
  await add('San Francisco')
  await add('Asia/Tokyo')
  const rows = world.getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('New York')
  await expect(rows.nth(0)).toContainText('America/New_York')
  await expect(rows.nth(1)).toContainText('San Francisco')
  await expect(rows.nth(1)).toContainText('America/Los_Angeles')
  await expect(rows.nth(2)).toContainText('Tokyo')

  await world.getByRole('button', { name: 'Move Tokyo up' }).click()
  await expect(rows.nth(1)).toContainText('Tokyo')

  await world.getByRole('button', { name: 'Remove New York' }).click()
  await expect(rows).toHaveCount(2)
  const saved = await readStorage<Array<{ label: string }>>(page, 'sync', 'worldClocks')
  expect(saved.map((entry) => entry.label).sort()).toEqual(['San Francisco', 'Tokyo'])
})

test('rejects a place it cannot find and a duplicate', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const world = await openTab(page, 'World')

  await world.getByLabel('Time zone', { exact: true }).fill('Atlantis')
  await world.getByRole('button', { name: 'Add' }).click()
  await expect(world.getByRole('alert')).toContainText('Could not find "Atlantis"')

  await world.getByLabel('Time zone', { exact: true }).fill('London')
  await world.getByRole('button', { name: 'Add' }).click()
  await world.getByLabel('Time zone', { exact: true }).fill('Europe/London')
  await world.getByRole('button', { name: 'Add' }).click()
  await expect(world.getByRole('alert')).toContainText('already on the list')
  await expect(world.getByRole('listitem')).toHaveCount(1)
})

test('plans a meeting time across zones', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const world = await openTab(page, 'World')
  await world.getByLabel('Time zone', { exact: true }).fill('UTC')
  await world.getByRole('button', { name: 'Add' }).click()

  await world.getByRole('switch', { name: 'Plan a meeting time' }).check()
  await world.getByLabel('Meeting time', { exact: true }).fill('15:30')

  // The fixture pins the browser to UTC, so a 15:30 local slot is 15:30 UTC.
  await expect(world.getByText('Meeting time here')).toBeVisible()
  await expect(world.getByRole('listitem').filter({ hasText: 'UTC' })).toContainText('15:30')
  await expect(world.getByRole('listitem').filter({ hasText: 'UTC' })).toContainText('Working hours')
})

test('shows saved cities on the overview', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const world = await openTab(page, 'World')
  await world.getByLabel('Time zone', { exact: true }).fill('Tokyo')
  await world.getByRole('button', { name: 'Add' }).click()

  const overview = await openTab(page, 'Clock')
  await expect(overview.getByRole('listitem').filter({ hasText: 'Tokyo' })).toBeVisible()
})
