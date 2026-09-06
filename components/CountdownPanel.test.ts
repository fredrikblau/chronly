import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCountdown } from '../lib/core/scheduler'
import { createExtensionStorageBackend, RecordStore } from '../lib/core/storage'
import { recordActions } from '../lib/ui/records'
import CountdownPanel from './CountdownPanel.svelte'

const store = () => new RecordStore(createExtensionStorageBackend('local'))

describe('CountdownPanel', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  it('lists an existing running countdown', async () => {
    await store().upsert(createCountdown('Tea', 5 * 60_000, Date.now()))

    render(CountdownPanel)

    expect(await screen.findByText('Tea')).toBeInTheDocument()
  })

  it('shows an empty state when there are no timers', async () => {
    render(CountdownPanel)

    expect(await screen.findByText(/No timers running/i)).toBeInTheDocument()
  })

  it('starts a new countdown from the form', async () => {
    render(CountdownPanel)

    await fireEvent.input(screen.getByPlaceholderText('Label'), { target: { value: 'Pasta' } })
    await fireEvent.click(screen.getByText('Start'))

    expect(await screen.findByText('Pasta')).toBeInTheDocument()
  })

  it('keeps the timer draft when storage rejects it', async () => {
    let rejectWrite: (reason?: unknown) => void = () => undefined
    vi.spyOn(recordActions, 'upsert').mockImplementation(() => {
      const write = new Promise<void>((_resolve, reject) => (rejectWrite = reject))
      void write.catch(() => undefined)
      return write
    })
    render(CountdownPanel)
    const label = screen.getByLabelText('Timer label')
    const start = screen.getByRole('button', { name: 'Start' })
    await fireEvent.input(label, { target: { value: 'Pasta' } })

    await fireEvent.click(start)
    const disabledWhileSaving = start.hasAttribute('disabled') && label.hasAttribute('disabled')
    rejectWrite(new Error('storage unavailable'))

    expect(disabledWhileSaving).toBe(true)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not start')
    expect(label).toHaveValue('Pasta')
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('falls back to a default label when none is given', async () => {
    render(CountdownPanel)

    await fireEvent.click(screen.getByText('Start'))

    expect(await screen.findByText('Timer')).toBeInTheDocument()
  })

  it('refuses to start a zero-length countdown', async () => {
    render(CountdownPanel)

    await fireEvent.input(screen.getByLabelText('Minutes'), { target: { value: '0' } })
    await fireEvent.input(screen.getByLabelText('Seconds'), { target: { value: '0' } })
    await fireEvent.click(screen.getByText('Start'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(await store().getAll()).toEqual([])
  })

  it('fills the duration fields from a quick preset', async () => {
    render(CountdownPanel)

    await fireEvent.click(screen.getByRole('button', { name: '10 minutes' }))

    expect(screen.getByLabelText('Minutes')).toHaveValue(10)
    expect(screen.getByLabelText('Seconds')).toHaveValue(0)
  })

  it('shows the remaining time for a running countdown', async () => {
    await store().upsert(createCountdown('Tea', 5 * 60_000, Date.now()))

    render(CountdownPanel)

    expect(await screen.findByText(/^0?4:5\d$|^5:00$/)).toBeInTheDocument()
  })

  it('pauses a running countdown and offers to resume it', async () => {
    await store().upsert(createCountdown('Tea', 5 * 60_000, Date.now()))

    render(CountdownPanel)

    await fireEvent.click(await screen.findByRole('button', { name: 'Pause Tea' }))

    expect(await screen.findByRole('button', { name: 'Resume Tea' })).toBeInTheDocument()
  })

  it('deletes a countdown', async () => {
    await store().upsert(createCountdown('Tea', 5 * 60_000, Date.now()))

    render(CountdownPanel)

    await fireEvent.click(await screen.findByRole('button', { name: 'Delete Tea' }))

    expect(await screen.findByText(/No timers running/i)).toBeInTheDocument()
  })

  it('marks a completed countdown as done and offers a restart', async () => {
    const done = createCountdown('Tea', 5 * 60_000, Date.now())
    await store().upsert({ ...done, status: 'completed', notified: true })

    render(CountdownPanel)

    expect(await screen.findByText('Done')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Restart Tea' })).toBeInTheDocument()
  })

  it('restarts a countdown with one update to the existing record', async () => {
    const done = createCountdown('Atomic restart', 5 * 60_000, Date.now())
    await store().upsert({ ...done, status: 'completed', notified: true })
    const remove = vi.spyOn(recordActions, 'remove')
    render(CountdownPanel)

    await fireEvent.click(await screen.findByRole('button', { name: 'Restart Atomic restart' }))

    await waitFor(async () => {
      const [restarted] = await store().getAll()
      expect(restarted).toMatchObject({ id: done.id, kind: 'countdown', status: 'running', notified: false })
    })
    expect(remove).not.toHaveBeenCalled()
  })
})
