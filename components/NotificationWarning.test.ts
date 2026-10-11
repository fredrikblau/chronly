import { fakeBrowser } from '@webext-core/fake-browser'
import { render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotificationWarning from './NotificationWarning.svelte'

describe('NotificationWarning', () => {
  afterEach(() => vi.restoreAllMocks())

  it('explains that alarms still ring when notifications are blocked', async () => {
    vi.spyOn(fakeBrowser.notifications, 'getPermissionLevel').mockResolvedValue('denied' as never)

    render(NotificationWarning)

    expect(await screen.findByText('Notifications are off for Chronly')).toBeInTheDocument()
  })

  it('stays hidden when notifications are allowed', async () => {
    const level = vi.spyOn(fakeBrowser.notifications, 'getPermissionLevel').mockResolvedValue('granted' as never)

    render(NotificationWarning)

    await vi.waitFor(() => expect(level).toHaveBeenCalled())
    expect(screen.queryByText('Notifications are off for Chronly')).toBeNull()
  })

  it('stays hidden where the browser cannot say (Firefox)', () => {
    render(NotificationWarning)
    expect(screen.queryByRole('note')).toBeNull()
  })
})
