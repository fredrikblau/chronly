import { expect } from '@playwright/test'
import { test } from './fixtures'
import { duePomodoro, notificationIds, openPopup, openTab, readRecords, readStorage, seedRecord } from './helpers'

test('starts, pauses, resumes, skips, and stops a session', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const focus = await openTab(page, 'Focus')

  await focus.getByRole('button', { name: /Sprint/ }).click()
  await expect(focus.getByLabel('Focus minutes', { exact: true })).toHaveValue('15')
  await focus.getByPlaceholder('Label').fill('Writing')
  await focus.getByRole('button', { name: 'Start', exact: true }).click()

  await expect(focus.getByText('Writing')).toBeVisible()
  await expect(focus.getByRole('timer')).toHaveText(/^1[45]:\d\d$/)

  await focus.getByRole('button', { name: 'Pause' }).click()
  await expect(focus.getByText('Paused', { exact: true })).toBeVisible()
  await focus.getByRole('button', { name: 'Resume' }).click()

  await focus.getByRole('button', { name: 'Skip to break' }).click()
  await expect(focus.getByText('Short break', { exact: true })).toBeVisible()
  await expect(focus.getByRole('timer')).toHaveText(/^[23]:\d\d$/)

  await focus.getByRole('button', { name: 'Stop' }).click()
  await expect(focus.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  expect(await readRecords(page)).toEqual([])
})

test('a finished focus phase rings, starts the break, and counts the session', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const pomodoro = duePomodoro('Deep work', 1500)
  await seedRecord(page, pomodoro)
  const focus = await openTab(page, 'Focus')

  await expect(focus.getByText('Short break', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => notificationIds(page)).toContain(`chronly-pomodoro-${pomodoro.id}`)
  await expect
    .poll(() => readStorage<{ totalFocusSessionsCompleted: number }>(page, 'local', 'pomodoroStats'))
    .toMatchObject({ totalFocusSessionsCompleted: 1 })
  await expect(focus.getByText('Today', { exact: true }).locator('xpath=following-sibling::dd')).toContainText('1')

  // Pause straight from the ringing banner, as the notification button would.
  const banner = page.getByRole('alert').filter({ hasText: 'Deep work' })
  await banner.getByRole('button', { name: 'Pause Deep work' }).click()
  await expect(banner).toBeHidden()
  await expect(focus.getByRole('button', { name: 'Resume' })).toBeVisible()
})

test('exports the current phase to a calendar', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const focus = await openTab(page, 'Focus')
  await focus.getByRole('button', { name: 'Start', exact: true }).click()

  const download = page.waitForEvent('download')
  await focus.getByRole('button', { name: 'Download the .ics calendar file for Focus end' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.ics$/)
})
