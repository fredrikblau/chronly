import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { createExtensionStorageBackend, SettingsStore } from '../lib/core/storage'
import AlertSettings from './AlertSettings.svelte'

const stored = () => new SettingsStore(createExtensionStorageBackend('sync')).get()

describe('AlertSettings', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('starts on a five-minute snooze', async () => {
    render(AlertSettings)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Snooze for 5 minutes' })).toHaveAttribute('aria-pressed', 'true'),
    )
  })

  it('saves a new snooze length', async () => {
    render(AlertSettings)

    await fireEvent.click(screen.getByRole('button', { name: 'Snooze for 10 minutes' }))

    await waitFor(async () => expect((await stored()).snoozeMinutes).toBe(10))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Snooze for 10 minutes' })).toHaveAttribute('aria-pressed', 'true'),
    )
  })

  it('turns gentle wake on and off', async () => {
    render(AlertSettings)
    const toggle = screen.getByRole('switch', { name: 'Gentle wake' })
    expect(toggle).not.toBeChecked()

    await fireEvent.click(toggle)
    await waitFor(async () => expect((await stored()).gentleWake).toBe(true))

    await fireEvent.click(toggle)
    await waitFor(async () => expect((await stored()).gentleWake).toBe(false))
  })
})
