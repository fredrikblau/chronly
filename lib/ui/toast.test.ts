import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, holdToast, offerUndo, releaseToast, showToast, toast, TOAST_MS } from './toast'

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

  it('stays up while held, then gets its full time again once released', () => {
    showToast('Deleted')
    vi.advanceTimersByTime(TOAST_MS - 1000)
    holdToast()
    vi.advanceTimersByTime(TOAST_MS * 3)
    expect(get(toast)?.message).toBe('Deleted')

    releaseToast()
    vi.advanceTimersByTime(TOAST_MS - 1)
    expect(get(toast)?.message).toBe('Deleted')
    vi.advanceTimersByTime(1)
    expect(get(toast)).toBeNull()
  })

  it('does nothing on release when no toast is showing', () => {
    releaseToast()
    vi.advanceTimersByTime(TOAST_MS)
    expect(get(toast)).toBeNull()
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
