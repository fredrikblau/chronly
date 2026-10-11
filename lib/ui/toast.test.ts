import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, offerUndo, showToast, toast, TOAST_MS } from './toast'

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    dismissToast()
  })

  afterEach(() => vi.useRealTimers())

  it('shows a message and hides it after a few seconds', () => {
    showToast('Saved')
    expect(get(toast)?.message).toBe('Saved')

    vi.advanceTimersByTime(TOAST_MS)
    expect(get(toast)).toBeNull()
  })

  it('lets a newer toast replace an older one without the old timer hiding it early', () => {
    showToast('First')
    vi.advanceTimersByTime(TOAST_MS - 100)
    showToast('Second')
    vi.advanceTimersByTime(200)

    expect(get(toast)?.message).toBe('Second')
  })

  it('offers Undo with the restore action', async () => {
    const restore = vi.fn(async () => {})
    offerUndo('Deleted “Gym”', restore)

    const current = get(toast)
    expect(current).toMatchObject({ message: 'Deleted “Gym”', actionLabel: 'Undo' })
    await current?.action?.()
    expect(restore).toHaveBeenCalledOnce()
  })

  it('dismisses only the toast it was asked to', () => {
    const first = showToast('First')
    showToast('Second')

    dismissToast(first)

    expect(get(toast)?.message).toBe('Second')
  })
})
