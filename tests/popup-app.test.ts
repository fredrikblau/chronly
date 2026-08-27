import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { createExtensionStorageBackend, SettingsStore } from '../lib/core/storage'
import type { Settings } from '../lib/core/types'
import App from '../entrypoints/popup/App.svelte'

async function seedSettings(patch: Partial<Settings>): Promise<void> {
  await new SettingsStore(createExtensionStorageBackend('sync')).update(patch)
}

const root = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('.app')
  if (!el) throw new Error('popup root not rendered')
  return el as HTMLElement
}

describe('popup App', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('exposes every section as a tab', () => {
    render(App)
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual([
      'Clock',
      'Alarms',
      'Timers',
      'Stopwatch',
      'World',
      'Focus',
      'Settings',
    ])
  })

  it('opens on the clock tab', () => {
    render(App)
    expect(screen.getByRole('tab', { name: 'Clock' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Clock' })).toBeVisible()
  })

  it('switches the visible panel when a tab is clicked', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('tab', { name: 'Alarms' }))

    expect(screen.getByRole('tab', { name: 'Alarms' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Clock' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel', { name: 'Alarms' })).toBeVisible()
  })

  it('moves between tabs with the arrow keys', async () => {
    render(App)
    await fireEvent.keyDown(screen.getByRole('tab', { name: 'Clock' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Alarms' })).toHaveAttribute('aria-selected', 'true')

    // Wraps backwards from the first tab to the last.
    await fireEvent.keyDown(screen.getByRole('tab', { name: 'Alarms' }), { key: 'ArrowLeft' })
    await fireEvent.keyDown(screen.getByRole('tab', { name: 'Clock' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps inactive panels mounted so their storage subscriptions stay live', async () => {
    const { container } = render(App)
    await fireEvent.click(screen.getByRole('tab', { name: 'Alarms' }))

    // The clock panel is hidden, not removed — unmounting would leave the
    // module-level stores in lib/ui serving stale data on the way back.
    const clockPanel = container.querySelector('#panel-clock')
    expect(clockPanel).not.toBeNull()
    expect(clockPanel).toHaveAttribute('hidden')
  })

  it('only exposes one tab to the tab sequence at a time', () => {
    render(App)
    const focusable = screen.getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0')
    expect(focusable).toHaveLength(1)
  })
})

// jsdom applies no scoped stylesheet, so these can only assert what the popup
// hands the CSS: the attributes and custom properties the palette hangs off.
describe('popup App appearance', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('resolves the chosen theme onto the root', async () => {
    await seedSettings({ theme: 'light' })

    const { container } = render(App)

    await waitFor(() => expect(root(container)).toHaveAttribute('data-surface', 'light'))
    expect(root(container)).toHaveAttribute('data-theme', 'light')
  })

  // No prefers-color-scheme match in jsdom, which is the same answer a browser
  // gives on a dark desktop.
  it('leaves an auto theme on the dark palette when nothing asks for light', async () => {
    const { container } = render(App)

    await waitFor(() => expect(root(container)).toHaveAttribute('data-theme', 'auto'))
    expect(root(container)).toHaveAttribute('data-surface', 'dark')
  })

  it('paints a saved background that reads the same way round as the palette', async () => {
    await seedSettings({ theme: 'dark', background: { type: 'solid', value: '#112233', accentColor: '#8b7cf6' } })

    const { container } = render(App)

    await waitFor(() => expect(root(container).style.getPropertyValue('--bg')).toBe('#112233'))
  })

  // The default background is near-black. Painting it under a light palette
  // would print near-black text on near-black, so the popup declines it.
  it('falls back to a plain surface when the background fights the palette', async () => {
    await seedSettings({ theme: 'light' })

    const { container } = render(App)

    await waitFor(() => expect(root(container)).toHaveAttribute('data-surface', 'light'))
    expect(root(container).style.getPropertyValue('--bg')).toBe('#f6f6f9')
  })

  it('never paints an image background behind the controls', async () => {
    await seedSettings({
      theme: 'dark',
      background: { type: 'image', value: 'https://example.test/a.jpg', accentColor: '#00ff00' },
    })

    const { container } = render(App)

    // The settings store keeps its last value between subscriptions, so waiting
    // on a value unique to this test is what proves the seeded one has landed.
    await waitFor(() => expect(root(container).style.getPropertyValue('--accent')).toBe('#00ff00'))
    expect(root(container).style.getPropertyValue('--bg')).toBe('#0b0b0f')
  })

  it('publishes the accent so every panel inherits it', async () => {
    await seedSettings({ background: { type: 'solid', value: '#0b0b0f', accentColor: '#ff0000' } })

    const { container } = render(App)

    await waitFor(() => expect(root(container).style.getPropertyValue('--accent')).toBe('#ff0000'))
  })

  it('picks ink for the accent fills from the accent itself', async () => {
    await seedSettings({ background: { type: 'solid', value: '#0b0b0f', accentColor: '#f7f3ff' } })

    const { container } = render(App)

    // A near-white accent needs dark text on it; the dark default would vanish.
    await waitFor(() => expect(root(container).style.getPropertyValue('--on-accent')).toBe('#14121f'))

    await seedSettings({ background: { type: 'solid', value: '#0b0b0f', accentColor: '#241b4d' } })
    await waitFor(() => expect(root(container).style.getPropertyValue('--on-accent')).toBe('#f5f5f7'))
  })

  // Panels size themselves in rem, which resolves against the document root and
  // not the popup's own element.
  it('scales the document root so the popup text follows the text-size setting', async () => {
    await seedSettings({ fontScale: 1.5 })

    render(App)

    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.5'))
  })

  it('hands the resolved palette to the native controls', async () => {
    await seedSettings({ theme: 'light' })

    render(App)

    await waitFor(() => expect(document.documentElement.style.colorScheme).toBe('light'))
  })

  it('marks the popup reduced-motion when the setting is on', async () => {
    await seedSettings({ reducedMotion: true })

    const { container } = render(App)

    await waitFor(() => expect(root(container)).toHaveClass('reduced-motion'))
  })
})
