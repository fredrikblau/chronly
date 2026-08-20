import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../entrypoints/popup/App.svelte'

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
