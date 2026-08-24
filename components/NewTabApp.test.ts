import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTimeInZone } from '../lib/core/time'
import { createExtensionStorageBackend, SettingsStore, WorldClockStore } from '../lib/core/storage'
import type { Settings, WorldClockEntry } from '../lib/core/types'
import NewTabApp from './NewTabApp.svelte'

// Deterministic instant so the world-clock strip can be asserted against a
// literal. Only Date is faked: createNowStore drives itself off a real
// setInterval, and Testing Library's waitFor needs real timers to poll.
const FIXED = new Date('2026-03-01T12:00:00Z')

async function seedClocks(...entries: Partial<WorldClockEntry>[]): Promise<void> {
  const store = new WorldClockStore(createExtensionStorageBackend('sync'))
  // Upsert is read-modify-write on a single key, so these must run in sequence.
  for (const [index, entry] of entries.entries()) {
    await store.upsert({
      id: `wc-${index}`,
      timeZone: 'UTC',
      label: `Zone ${index}`,
      color: '#8b7cf6',
      order: index,
      ...entry,
    })
  }
}

async function seedSettings(patch: Partial<Settings>): Promise<void> {
  await new SettingsStore(createExtensionStorageBackend('sync')).update(patch)
}

const dashboard = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector('.dashboard')
  if (!el) throw new Error('dashboard not rendered')
  return el as HTMLElement
}

describe('NewTabApp', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXED)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the clock and a quick-access control', async () => {
    render(NewTabApp)

    expect(await screen.findByRole('timer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alarms & timers' })).toBeInTheDocument()
  })

  it('renders the local date alongside the clock', async () => {
    render(NewTabApp)

    await screen.findByRole('timer')
    const expected = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(FIXED)
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('renders a strip entry for each saved world clock', async () => {
    await seedClocks(
      { id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo' },
      { id: 'paris', timeZone: 'Europe/Paris', label: 'Paris' },
    )

    render(NewTabApp)

    expect(await screen.findByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows each world clock in its own zone, not the local one', async () => {
    await seedClocks({ id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo' })

    render(NewTabApp)

    await screen.findByText('Tokyo')
    // 12:00 UTC is 21:00 in Tokyo (UTC+9, no DST).
    expect(screen.getByText('21:00')).toBeInTheDocument()
  })

  it('honours the 12-hour preference in the strip', async () => {
    await seedClocks({ id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo' })
    await seedSettings({ hour12: true })

    render(NewTabApp)

    const expected = formatTimeInZone(FIXED, 'Asia/Tokyo', { hour12: true, showSeconds: false })
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('21:00')).toBeNull()
  })

  it('omits the strip entirely when no world clocks are saved', async () => {
    render(NewTabApp)

    await screen.findByRole('timer')
    // The world-clock store is a module-level readable that keeps its last
    // value between subscriptions, so an empty storage read has to land first.
    await waitFor(() => expect(screen.queryByRole('list')).toBeNull())
  })

  it('applies the configured background as a CSS variable', async () => {
    await seedSettings({ background: { type: 'solid', value: '#112233', accentColor: '#ff0000' } })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    // The settings store hydrates asynchronously, so the first paint still shows
    // the defaults; this has to wait for the loaded value rather than read once.
    await waitFor(() => expect(dashboard(container).style.getPropertyValue('--bg')).toBe('#112233'))
    expect(dashboard(container).style.getPropertyValue('--accent')).toBe('#ff0000')
  })

  it('wraps an image background in url()', async () => {
    await seedSettings({
      background: { type: 'image', value: 'https://example.test/a.jpg', accentColor: '#8b7cf6' },
    })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() =>
      expect(dashboard(container).style.getPropertyValue('--bg')).toBe('url(https://example.test/a.jpg)'),
    )
  })

  it('falls back when stored image settings contain unsafe CSS input', async () => {
    await seedSettings({
      background: {
        type: 'image',
        value: 'https://example.test/photo.jpg);color:red;--escaped:url(x',
        accentColor: '#8b7cf6',
      },
    })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container).style.getPropertyValue('--bg')).toBe('#0b0b0f'))
  })

  it('reflects the configured theme on the dashboard', async () => {
    await seedSettings({ theme: 'light' })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container)).toHaveAttribute('data-theme', 'light'))
  })

  // The background is chosen independently of the theme, so the theme alone
  // cannot decide the text colour: 'auto' on a light OS with the default dark
  // background would paint near-black text on near-black. The surface the text
  // actually sits on wins wherever it can be read.
  it('keeps the palette light over a dark custom background', async () => {
    await seedSettings({ theme: 'light', background: { type: 'solid', value: '#101018', accentColor: '#8b7cf6' } })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container)).toHaveClass('on-dark'))
    expect(dashboard(container)).not.toHaveClass('on-light')
  })

  it('flips the palette dark over a light custom background', async () => {
    await seedSettings({ theme: 'dark', background: { type: 'solid', value: '#fdf6e3', accentColor: '#8b7cf6' } })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container)).toHaveClass('on-light'))
  })

  it('reads the stops of a gradient background to pick the palette', async () => {
    await seedSettings({
      background: { type: 'gradient', value: 'linear-gradient(160deg, #f7f7fb, #e6e6f2)', accentColor: '#8b7cf6' },
    })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container)).toHaveClass('on-light'))
  })

  it('leaves the palette to the theme when the background colour cannot be read', async () => {
    await seedSettings({ theme: 'light', background: { type: 'solid', value: 'papayawhip', accentColor: '#8b7cf6' } })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container)).toHaveAttribute('data-theme', 'light'))
    expect(dashboard(container)).not.toHaveClass('on-dark')
    expect(dashboard(container)).not.toHaveClass('on-light')
  })

  it('scrims an image background and reads light over it', async () => {
    await seedSettings({
      background: { type: 'image', value: 'https://example.test/a.jpg', accentColor: '#8b7cf6' },
    })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container)).toHaveClass('image-bg'))
    expect(dashboard(container)).toHaveClass('on-dark')
  })

  it('renders the analog face when the clock mode asks for it', async () => {
    await seedSettings({ clockMode: 'analog' })

    const { container } = render(NewTabApp)

    await waitFor(() => expect(container.querySelector('svg.analog')).toBeInTheDocument())
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('drops seconds from the clock when the setting is off', async () => {
    await seedSettings({ showSeconds: false })

    render(NewTabApp)

    const face = await screen.findByRole('timer')
    await waitFor(() => expect(face).toHaveTextContent(/^\d{2}:\d{2}$/))
  })

  // The page furniture sizes itself in rem, which resolves against the document
  // root rather than the dashboard element, so the scale has to land there.
  it('scales the document root so the text-size setting reaches the page', async () => {
    await seedSettings({ fontScale: 1.5 })

    render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.5'))
  })

  it('marks the page as reduced-motion when the setting is on', async () => {
    await seedSettings({ reducedMotion: true })

    const { container } = render(NewTabApp)
    await screen.findByRole('timer')

    await waitFor(() => expect(dashboard(container)).toHaveClass('reduced-motion'))
  })

  it('falls back to a visible hint when the browser cannot open the popup', async () => {
    render(NewTabApp)

    const button = await screen.findByRole('button', { name: 'Alarms & timers' })
    expect(screen.queryByRole('status')).toBeNull()

    await fireEvent.click(button)

    // fakeBrowser exposes no action.openPopup, which is the same situation as a
    // browser that has not shipped it; the user still needs a way through.
    expect(await screen.findByRole('status')).toHaveTextContent(/toolbar/i)
  })
})
