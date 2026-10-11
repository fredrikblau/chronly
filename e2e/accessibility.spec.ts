import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'
import { test } from './fixtures'
import { openPopup, openTab } from './helpers'

const TABS = ['Clock', 'Alarms', 'Timers', 'Stopwatch', 'World', 'Focus', 'Settings']

for (const theme of ['Dark', 'Light'] as const) {
  test(`every tab passes an axe WCAG 2.1 AA audit in the ${theme.toLowerCase()} theme`, async ({
    context,
    extensionId,
  }) => {
    const page = await openPopup(context, extensionId)
    const settings = await openTab(page, 'Settings')
    await settings.locator('label.option').filter({ hasText: theme }).click()

    // Give each panel something to show, so lists and controls are audited too.
    const alarms = await openTab(page, 'Alarms')
    await alarms.getByPlaceholder('Label').fill('Audit alarm')
    await alarms.getByRole('button', { name: 'Add alarm', exact: true }).click()
    const world = await openTab(page, 'World')
    await world.getByLabel('Time zone', { exact: true }).fill('Tokyo')
    await world.getByRole('button', { name: 'Add' }).click()
    await expect(world.getByRole('listitem')).toHaveCount(1)

    for (const name of TABS) {
      await openTab(page, name)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // Hidden tab panels are out of the accessibility tree; audit what shows.
        .include(`#panel-${name === 'Clock' ? 'clock' : name.toLowerCase()}`)
        .include('[role="tablist"]')
        .analyze()
      const summary = results.violations.map(
        (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      )
      expect.soft(summary, `${name} tab`).toEqual([])
    }
  })
}

declare const chrome: { storage: { session: { set(items: object): Promise<void> } } }

for (const theme of ['Dark', 'Light'] as const) {
  test(`active states pass the audit in the ${theme.toLowerCase()} theme`, async ({ context, extensionId }) => {
    const page = await openPopup(context, extensionId)
    const settings = await openTab(page, 'Settings')
    await settings.locator('label.option').filter({ hasText: theme }).click()

    const timers = await openTab(page, 'Timers')
    await timers.getByRole('button', { name: 'Start', exact: true }).click()
    await timers.getByRole('button', { name: 'Start', exact: true }).click()
    await timers
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: /^Pause/ })
      .click()
    const focus = await openTab(page, 'Focus')
    await focus.getByRole('button', { name: 'Start', exact: true }).click()
    await page.evaluate(() =>
      chrome.storage.session.set({
        activeAlerts: {
          audit: {
            recordId: 'audit',
            kind: 'alarm',
            notificationId: 'chronly-alarm-audit',
            title: 'Audit ring',
            message: 'Your alarm is going off.',
            firedAt: Date.now(),
          },
        },
      }),
    )
    await expect(page.getByRole('alert').filter({ hasText: 'Audit ring' })).toBeVisible()

    for (const name of ['Clock', 'Timers', 'Focus']) {
      await openTab(page, name)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include(`#panel-${name.toLowerCase()}`)
        .include('[aria-label="Ringing now"]')
        .analyze()
      const summary = results.violations.map(
        (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      )
      expect.soft(summary, `${name} tab while active`).toEqual([])
    }
  })
}
