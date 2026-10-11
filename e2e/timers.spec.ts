import { expect } from '@playwright/test'
import { test } from './fixtures'
import { notificationIds, openPopup, openTab, readRecords, recordAlarmNames, soundStatus } from './helpers'

test('starts, pauses, resumes, extends, and deletes a timer', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const timers = await openTab(page, 'Timers')

  await timers.getByRole('button', { name: '10 minutes', exact: true }).click()
  await timers.getByPlaceholder('Label').fill('Pasta')
  await timers.getByRole('button', { name: 'Start', exact: true }).click()

  const row = timers.getByRole('listitem').filter({ hasText: 'Pasta' })
  await expect(row.getByRole('timer')).toHaveText(/^(10:00|9:5\d)$/)

  await row.getByRole('button', { name: 'Pause Pasta' }).click()
  await expect(row).toContainText('Paused')
  const frozen = await row.getByRole('timer').textContent()
  await page.waitForTimeout(1200)
  await expect(row.getByRole('timer')).toHaveText(frozen!)
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(0)

  await row.getByRole('button', { name: 'Resume Pasta' }).click()
  await expect(row).not.toContainText('Paused')
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(1)

  await row.getByRole('button', { name: 'Add 1 minute to Pasta' }).click()
  await expect(row.getByRole('timer')).toHaveText(/^1[01]:\d\d$/)

  await row.getByRole('button', { name: 'Delete Pasta' }).click()
  await expect(timers.getByText('No timers running')).toBeVisible()
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(0)

  // Deleting is instant, so it can be undone: the timer returns, still counting.
  await page.getByRole('status').filter({ hasText: 'Deleted “Pasta”' }).getByRole('button', { name: 'Undo' }).click()
  await expect(row.getByRole('timer')).toHaveText(/^1[01]:\d\d$/)
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(1)
})

test('runs several timers at once', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const timers = await openTab(page, 'Timers')

  for (const [label, preset] of [
    ['Eggs', '5 minutes'],
    ['Rice', '15 minutes'],
  ]) {
    await timers.getByRole('button', { name: preset, exact: true }).click()
    await timers.getByPlaceholder('Label').fill(label!)
    await timers.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(timers.getByRole('listitem').filter({ hasText: label })).toBeVisible()
  }

  await expect(timers.getByRole('listitem')).toHaveCount(2)
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(2)
})

test('a finished timer notifies, rings in the popup, and can be restarted', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const timers = await openTab(page, 'Timers')
  await timers.getByPlaceholder('Label').fill('Delivery test')
  await timers.getByRole('spinbutton', { name: 'Minutes' }).fill('0')
  await timers.getByRole('spinbutton', { name: 'Seconds' }).fill('2')
  await timers.getByRole('button', { name: 'Start', exact: true }).click()

  const row = timers.getByRole('listitem').filter({ hasText: 'Delivery test' })
  await expect(row).toContainText('Done', { timeout: 15_000 })
  await expect.poll(() => notificationIds(page)).toEqual([expect.stringMatching(/^chronly-countdown-/)])
  await expect(page.getByRole('alert').filter({ hasText: 'Delivery test' })).toBeVisible()

  await row.getByRole('button', { name: 'Restart Delivery test' }).click()
  await expect(row.getByRole('timer')).toHaveText(/^0:0[12]$/)
})

test('dismissing a finished timer from the banner clears it', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const timers = await openTab(page, 'Timers')
  await timers.getByPlaceholder('Label').fill('Kettle')
  await timers.getByRole('spinbutton', { name: 'Minutes' }).fill('0')
  await timers.getByRole('spinbutton', { name: 'Seconds' }).fill('1')
  await timers.getByRole('button', { name: 'Start', exact: true }).click()

  const banner = page.getByRole('alert').filter({ hasText: 'Kettle' })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  // The ring keeps sounding until someone dismisses it.
  await expect.poll(async () => (await soundStatus(page)).audible).toHaveLength(1)
  await page.waitForTimeout(2500)
  expect((await soundStatus(page)).audible).toHaveLength(1)
  await banner.getByRole('button', { name: 'Dismiss Kettle' }).click()

  await expect(banner).toBeHidden()
  await expect.poll(async () => (await soundStatus(page)).active).toEqual([])
  await expect(timers.getByText('No timers running')).toBeVisible()
  await expect.poll(() => notificationIds(page)).toEqual([])
})

test('timers survive the MV3 service worker being shut down', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const timers = await openTab(page, 'Timers')
  await timers.getByPlaceholder('Label').fill('Suspension test')
  await timers.getByRole('button', { name: '1 minutes', exact: true }).click()
  await timers.getByRole('button', { name: 'Start', exact: true }).click()
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(1)

  const cdp = await context.newCDPSession(page)
  const { targetInfos } = await cdp.send('Target.getTargets')
  const worker = targetInfos.find(
    (target) => target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/background.js`,
  )
  if (!worker) throw new Error('Could not find the Chronly service-worker target')
  await cdp.send('Target.closeTarget', { targetId: worker.targetId })

  const reopened = await openPopup(context, extensionId)
  const restored = (await openTab(reopened, 'Timers')).getByRole('listitem').filter({ hasText: 'Suspension test' })
  await expect(restored).toBeVisible()
  await restored.getByRole('button', { name: 'Delete Suspension test' }).click()
  await expect(restored).toHaveCount(0)
  await expect.poll(() => recordAlarmNames(reopened)).toHaveLength(0)
  expect(await readRecords(reopened)).toEqual([])
})
