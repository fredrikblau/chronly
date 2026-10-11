import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveAlertStore, createExtensionStorageBackend, SettingsStore } from '../lib/core/storage'
import type { ActiveAlert } from '../lib/core/types'
import RingingBanner from './RingingBanner.svelte'

function ringing(patch: Partial<ActiveAlert> = {}): ActiveAlert {
  return {
    recordId: 'alarm-1',
    kind: 'alarm',
    notificationId: 'chronly-alarm-alarm-1',
    title: 'Wake up',
    message: 'Your alarm is going off.',
    firedAt: Date.now(),
    ...patch,
  }
}

async function ring(alert: ActiveAlert): Promise<void> {
  await new ActiveAlertStore(createExtensionStorageBackend('session')).add(alert)
}

describe('RingingBanner', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  it('stays out of the way while nothing rings', () => {
    render(RingingBanner)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('appears as soon as the background reports a ringing alarm', async () => {
    render(RingingBanner)
    await ring(ringing())

    expect(await screen.findByRole('alert')).toHaveTextContent('Wake up')
    expect(screen.getByRole('button', { name: 'Snooze 5 min Wake up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss Wake up' })).toBeInTheDocument()
  })

  it('offers Pause for a Pomodoro and only Dismiss for a timer', async () => {
    await ring(ringing({ recordId: 'p', kind: 'pomodoro', title: 'Deep work' }))
    await ring(ringing({ recordId: 't', kind: 'countdown', title: 'Tea' }))
    render(RingingBanner)

    expect(await screen.findByRole('button', { name: 'Pause Deep work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss Tea' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Snooze 5 min Tea' })).toBeNull()
  })

  it('asks the background to act on the alert', async () => {
    const send = vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(true as never)
    await ring(ringing())
    render(RingingBanner)

    await fireEvent.click(await screen.findByRole('button', { name: 'Snooze 5 min Wake up' }))

    expect(send).toHaveBeenCalledWith({
      target: 'background',
      type: 'alert-action',
      recordId: 'alarm-1',
      action: 'snooze',
    })
  })

  it('says so when the background cannot be reached', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockRejectedValue(new Error('no receiver'))
    await ring(ringing())
    render(RingingBanner)

    await fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Wake up' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not reach Chronly'))
  })

  it('names the snooze length chosen in settings', async () => {
    await new SettingsStore(createExtensionStorageBackend('sync')).update({ snoozeMinutes: 15 })
    await ring(ringing())
    render(RingingBanner)

    expect(await screen.findByRole('button', { name: 'Snooze 15 min Wake up' })).toBeInTheDocument()
  })
})
