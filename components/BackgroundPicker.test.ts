import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { createExtensionStorageBackend, SettingsStore } from '../lib/core/storage'
import type { BackgroundConfig, Settings } from '../lib/core/types'
import BackgroundPicker from './BackgroundPicker.svelte'

const readSettings = () => new SettingsStore(createExtensionStorageBackend('sync')).get()

async function seed(patch: Partial<Settings>): Promise<void> {
  await new SettingsStore(createExtensionStorageBackend('sync')).update(patch)
}

// settingsActions.update() is fire-and-forget from the event handler, so the
// write lands a few microtasks after the event that triggered it.
async function expectBackground(expected: Partial<BackgroundConfig>): Promise<void> {
  await waitFor(async () => {
    expect((await readSettings()).background).toMatchObject(expected)
  })
}

const SUNSET = 'linear-gradient(135deg, #ff7e5f, #feb47b)'

describe('BackgroundPicker', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('applies a gradient preset', async () => {
    render(BackgroundPicker)

    await fireEvent.click(await screen.findByRole('button', { name: 'Sunset' }))

    await expectBackground({ type: 'gradient' })
    expect((await readSettings()).background.value).toContain('#ff7e5f')
  })

  it('marks the selected gradient as pressed', async () => {
    render(BackgroundPicker)

    await fireEvent.click(await screen.findByRole('button', { name: 'Aurora' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aurora' })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.getByRole('button', { name: 'Sunset' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies a custom gradient from the builder', async () => {
    render(BackgroundPicker)

    await fireEvent.input(screen.getByLabelText('Start'), { target: { value: '#112233' } })
    await fireEvent.input(screen.getByLabelText('End'), { target: { value: '#aabbcc' } })
    await fireEvent.input(screen.getByLabelText('Angle'), { target: { value: '45' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Apply custom gradient' }))

    await expectBackground({ type: 'gradient', value: 'linear-gradient(45deg, #112233, #aabbcc)' })
  })

  it('sets a solid colour', async () => {
    render(BackgroundPicker)

    await fireEvent.input(screen.getByLabelText('Solid colour'), { target: { value: '#123456' } })

    await expectBackground({ type: 'solid', value: '#123456' })
  })

  it('sets the accent colour without disturbing the background type', async () => {
    await seed({ background: { type: 'gradient', value: SUNSET, accentColor: '#8b7cf6' } })
    render(BackgroundPicker)

    // The settings store is module-level: a fresh subscriber is handed the last
    // cached value before its storage read resolves, so the seeded state has to
    // be on screen before the component can act on it.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sunset' })).toHaveAttribute('aria-pressed', 'true')
    })
    await fireEvent.input(screen.getByLabelText('Accent colour'), { target: { value: '#00ff00' } })

    await expectBackground({ type: 'gradient', value: SUNSET, accentColor: '#00ff00' })
  })

  it('can auto-pick an accent from a CSS background', async () => {
    await seed({ background: { type: 'solid', value: '#123456', accentColor: '#8b7cf6' } })
    render(BackgroundPicker)

    await waitFor(() => {
      expect(screen.getByLabelText('Solid colour')).toHaveValue('#123456')
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Auto-pick accent from background' }))

    await waitFor(async () => {
      expect((await readSettings()).background.accentColor).toBe('#123456')
    })
  })
})
