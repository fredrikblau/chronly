import { expect } from '@playwright/test'
import { test } from './fixtures'
import {
  badgeText,
  dueAlarm,
  notificationIds,
  openPopup,
  openTab,
  readRecords,
  readStorage,
  recordAlarmNames,
  seedRecord,
  soundStatus,
} from './helpers'

test('creates a repeating alarm and schedules it with the browser', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')

  await alarms.getByLabel('Time').fill('06:45')
  await alarms.getByRole('button', { name: 'Weekdays' }).click()
  await alarms.getByPlaceholder('Label').fill('Wake up')
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()

  const row = alarms.getByRole('listitem').filter({ hasText: 'Wake up' })
  await expect(row).toContainText('Weekdays')
  await expect(row.getByRole('switch', { name: 'Wake up alarm' })).toBeChecked()
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(1)
})

test('switches an alarm off and on, clearing and restoring its schedule', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  await alarms.getByPlaceholder('Label').fill('Nap')
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()
  const toggle = alarms.getByRole('switch', { name: 'Nap alarm' })
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(1)

  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect(alarms.getByRole('listitem').filter({ hasText: 'Nap' })).toContainText('Off')
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(0)

  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(1)
})

test('edits an alarm in place', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  await alarms.getByLabel('Time').fill('07:00')
  await alarms.getByPlaceholder('Label').fill('Standup')
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()
  await expect(alarms.getByRole('listitem').filter({ hasText: 'Standup' })).toBeVisible()
  const [created] = await readRecords(page)

  await alarms.getByRole('button', { name: 'Edit alarm Standup' }).click()
  await expect(alarms.getByLabel('Time')).toHaveValue('07:00')
  await alarms.getByLabel('Time').fill('09:30')
  await alarms.getByPlaceholder('Label').fill('Team sync')
  await alarms.getByRole('button', { name: 'Save changes' }).click()

  await expect(alarms.getByRole('listitem').filter({ hasText: 'Team sync' })).toContainText('09:30')
  const records = await readRecords(page)
  expect(records).toHaveLength(1)
  expect(records[0]?.id).toBe(created?.id)
})

test('deletes an alarm and its scheduled wake-up', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  await alarms.getByPlaceholder('Label').fill('Temporary')
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(1)

  await alarms.getByRole('button', { name: 'Delete alarm Temporary' }).click()

  await expect(alarms.getByText('No alarms yet')).toBeVisible()
  await expect.poll(() => recordAlarmNames(page)).toHaveLength(0)
})

test('Test fires a preview notification and sound without saving', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  const cdp = await context.newCDPSession(page)

  await alarms.getByRole('button', { name: 'Test', exact: true }).click()

  // Chrome plays alarm audio from an offscreen document; its creation proves
  // the sound path is wired.
  await expect
    .poll(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets')
      return targetInfos.some((target) => target.url === `chrome-extension://${extensionId}/offscreen.html`)
    })
    .toBe(true)
  await expect.poll(() => notificationIds(page)).toHaveLength(1)
  expect(await readRecords(page)).toEqual([])
})

test('exports an alarm to Google Calendar and as an .ics file', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarms = await openTab(page, 'Alarms')
  await alarms.getByPlaceholder('Label').fill('Dentist')
  await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()

  // Fresh profiles are signed out, so Google may redirect; the request that
  // left the extension is what proves the hand-off.
  const calendarRequest = context.waitForEvent('request', (request) => request.url().includes('calendar.google.com'))
  await alarms.getByRole('button', { name: 'Add alarm Dentist to Google Calendar' }).click()
  const url = new URL((await calendarRequest).url())
  expect(url.searchParams.get('text')).toBe('Dentist')

  const download = page.waitForEvent('download')
  await alarms.getByRole('button', { name: 'Download the .ics calendar file for alarm Dentist' }).click()
  expect((await download).suggestedFilename()).toBe('dentist.ics')
})

test('a due alarm rings, shows in the popup, and snoozes from the banner', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarm = dueAlarm('Ring test', 1500)
  await seedRecord(page, alarm)

  const banner = page.getByRole('alert').filter({ hasText: 'Ring test' })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => notificationIds(page)).toContain(`chronly-alarm-${alarm.id}`)
  await expect.poll(() => badgeText(page)).toBe('!')
  await expect.poll(async () => (await soundStatus(page)).audible).toContain(alarm.id)

  await banner.getByRole('button', { name: 'Snooze 5 min Ring test' }).click()

  await expect(banner).toBeHidden()
  await expect.poll(async () => (await soundStatus(page)).active).not.toContain(alarm.id)
  await expect.poll(() => notificationIds(page)).toEqual([])
  await expect.poll(() => badgeText(page)).toBe('')
  const [snoozed] = await readRecords(page)
  expect(snoozed).toMatchObject({ enabled: true, notified: false })
  expect(snoozed?.snoozedUntil).toBeGreaterThan(Date.now() + 4 * 60_000)
  const alarms = await openTab(page, 'Alarms')
  await expect(alarms.getByRole('listitem').filter({ hasText: 'Ring test' })).toContainText('Snoozed')
})

test('dismissing a rung one-off alarm switches it off but keeps it', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId)
  const alarm = dueAlarm('Dismiss test', 1500)
  await seedRecord(page, alarm)

  const banner = page.getByRole('alert').filter({ hasText: 'Dismiss test' })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.getByRole('button', { name: 'Dismiss Dismiss test' }).click()

  await expect(banner).toBeHidden()
  await expect.poll(() => readStorage(page, 'session', 'activeAlerts')).toEqual({})
  const alarms = await openTab(page, 'Alarms')
  const row = alarms.getByRole('listitem').filter({ hasText: 'Dismiss test' })
  await expect(row.getByRole('switch', { name: 'Dismiss test alarm' })).not.toBeChecked()
  await expect(row).toContainText('Rang')
})
