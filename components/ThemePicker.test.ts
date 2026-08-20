import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { createExtensionStorageBackend, SettingsStore } from '../lib/core/storage'
import type { Settings } from '../lib/core/types'
import ThemePicker from './ThemePicker.svelte'

// A fresh handle every time: the component writes through its own store, so
// reading back through a long-lived instance would risk observing a cached view.
const readSettings = () => new SettingsStore(createExtensionStorageBackend('sync')).get()

async function seed(patch: Partial<Settings>): Promise<void> {
  await new SettingsStore(createExtensionStorageBackend('sync')).update(patch)
}

// settingsActions.update() is fire-and-forget from the event handler, so the
// write lands a few microtasks after the event that triggered it.
async function expectSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await waitFor(async () => {
    expect((await readSettings())[key]).toEqual(value)
  })
}

describe('ThemePicker', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('updates the theme setting when a radio option is chosen', async () => {
    render(ThemePicker)

    await fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }))

    await expectSetting('theme', 'dark')
  })

  it('updates the clock face mode when a radio option is chosen', async () => {
    render(ThemePicker)

    await fireEvent.click(await screen.findByRole('radio', { name: 'Analog' }))

    await expectSetting('clockMode', 'analog')
  })

  it('groups each set of radios under its own accessible label', () => {
    render(ThemePicker)

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Clock face' })).toBeInTheDocument()
  })

  it('toggles the 12-hour clock setting', async () => {
    render(ThemePicker)

    await fireEvent.click(await screen.findByLabelText('12-hour clock'))

    await expectSetting('hour12', true)
  })

  it('toggles the show-seconds setting', async () => {
    render(ThemePicker)

    await fireEvent.click(await screen.findByLabelText('Show seconds'))

    await expectSetting('showSeconds', false)
  })

  it('toggles the reduced-motion setting', async () => {
    render(ThemePicker)

    await fireEvent.click(await screen.findByLabelText('Reduce motion'))

    await expectSetting('reducedMotion', true)
  })

  it('updates the font scale from the slider', async () => {
    render(ThemePicker)
    const slider = await screen.findByLabelText('Text size')

    await fireEvent.input(slider, { target: { value: '1.4' } })

    await expectSetting('fontScale', 1.4)
  })

  it('shows the font scale as a percentage', async () => {
    await seed({ fontScale: 1.5 })

    render(ThemePicker)

    expect(await screen.findByText('150%')).toBeInTheDocument()
  })

  it('reflects the stored settings when it mounts', async () => {
    await seed({ theme: 'light', clockMode: 'both', hour12: true, showSeconds: false })

    render(ThemePicker)

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
    })
    expect(screen.getByRole('radio', { name: 'Both' })).toBeChecked()
    expect(screen.getByLabelText('12-hour clock')).toBeChecked()
    expect(screen.getByLabelText('Show seconds')).not.toBeChecked()
  })

  it('keeps the two radio groups independent', async () => {
    render(ThemePicker)

    const themeNames = screen.getAllByRole('radio').map((el) => (el as HTMLInputElement).name)

    expect(new Set(themeNames).size).toBe(2)
  })
})
