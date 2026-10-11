import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAlarm, createCountdown, createPomodoro, disableAlarm } from '../lib/core/scheduler'
import { createExtensionStorageBackend, RecordStore, WorldClockStore } from '../lib/core/storage'
import type { CountdownRecord } from '../lib/core/types'
import OverviewPanel from './OverviewPanel.svelte'

const records = () => new RecordStore(createExtensionStorageBackend('local'))

describe('OverviewPanel', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  it('shows the clock and the date', () => {
    render(OverviewPanel, { now: Date.now() })
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('lists the next armed alarm, skipping ones that are off', async () => {
    const now = Date.now()
    await records().upsert(disableAlarm(createAlarm('Muted', now + 60_000, now), now))
    await records().upsert(createAlarm('Next up', now + 3_600_000, now))

    render(OverviewPanel, { now })

    expect(await screen.findByText('Next up')).toBeInTheDocument()
    expect(screen.queryByText('Muted')).toBeNull()
  })

  it('shows running timers and the focus session with time left', async () => {
    const now = Date.now()
    await records().upsert(createCountdown('Pasta', 9 * 60_000, now))
    await records().upsert(
      createPomodoro(
        'Writing',
        { focusMs: 25 * 60_000, shortBreakMs: 1, longBreakMs: 1, cyclesBeforeLongBreak: 4 },
        now,
      ),
    )

    render(OverviewPanel, { now })

    expect(await screen.findByText('Pasta')).toBeInTheDocument()
    expect(screen.getByText('9:00')).toBeInTheDocument()
    expect(screen.getByText('25:00')).toBeInTheDocument()
  })

  it('jumps to the matching tab from an item', async () => {
    const now = Date.now()
    await records().upsert(createCountdown('Jump', 60_000, now))
    const onNavigate = vi.fn()

    render(OverviewPanel, { now, onNavigate })
    await fireEvent.click(await screen.findByText('Jump'))

    expect(onNavigate).toHaveBeenCalledWith('timers')
  })

  it('starts a quick timer in one click', async () => {
    render(OverviewPanel, { now: Date.now() })

    await fireEvent.click(screen.getByRole('button', { name: 'Start a 5 minute timer' }))

    await waitFor(async () => {
      const timers = (await records().getAll()).filter((r): r is CountdownRecord => r.kind === 'countdown')
      expect(timers.map((t) => [t.label, t.durationMs])).toEqual([['5 min timer', 300_000]])
    })
  })

  it('offers next steps when nothing is scheduled', async () => {
    render(OverviewPanel, { now: Date.now() })
    expect(await screen.findByRole('button', { name: /Set an alarm/ })).toBeInTheDocument()
  })

  it('glances at saved world clocks', async () => {
    await new WorldClockStore(createExtensionStorageBackend('sync')).upsert({
      id: 'wc',
      timeZone: 'Asia/Tokyo',
      label: 'Tokyo office',
      color: '#ff0000',
      order: 0,
    })

    render(OverviewPanel, { now: Date.now() })

    expect(await screen.findByText('Tokyo office')).toBeInTheDocument()
  })
})
