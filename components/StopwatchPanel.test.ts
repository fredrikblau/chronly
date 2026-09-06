import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExtensionStorageBackend, StopwatchStore } from '../lib/core/storage'
import type { StopwatchState } from '../lib/core/types'
import StopwatchPanel from './StopwatchPanel.svelte'

const store = () => new StopwatchStore(createExtensionStorageBackend('local'))

const paused = (elapsedMsBeforeStart: number, laps: number[] = []): StopwatchState => ({
  status: 'paused',
  startedAt: null,
  elapsedMsBeforeStart,
  laps,
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('StopwatchPanel', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  afterEach(() => vi.restoreAllMocks())

  it('starts at 00:00.00 and toggles its button label', async () => {
    render(StopwatchPanel)

    expect(await screen.findByText('00:00.00')).toBeInTheDocument()
    await fireEvent.click(screen.getByText('Start'))
    expect(await screen.findByText('Pause')).toBeInTheDocument()
  })

  it('updates the display while running', async () => {
    render(StopwatchPanel)
    await screen.findByText('00:00.00')

    await fireEvent.click(screen.getByText('Start'))
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(screen.getByRole('timer')).not.toHaveTextContent('00:00.00')
  })

  it('cannot lap or reset an untouched stopwatch', async () => {
    render(StopwatchPanel)
    await flush()

    expect(screen.getByRole('button', { name: 'Lap' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('restores a persisted paused stopwatch instead of starting from zero', async () => {
    await store().set(paused(65_430))

    render(StopwatchPanel)

    expect(await screen.findByText('01:05.43')).toBeInTheDocument()
    expect(await screen.findByText('Resume')).toBeInTheDocument()
  })

  it('shows hours once the stopwatch passes an hour', async () => {
    await store().set(paused(3_723_450))

    render(StopwatchPanel)

    expect(await screen.findByText('1:02:03.45')).toBeInTheDocument()
  })

  it('persists a start so the elapsed time survives the popup closing', async () => {
    render(StopwatchPanel)
    await flush()

    await fireEvent.click(screen.getByText('Start'))
    await flush()

    const state = await store().get()
    expect(state.status).toBe('running')
    expect(state.startedAt).toBeTypeOf('number')
  })

  it('records laps with their split times, newest first', async () => {
    await store().set({ status: 'running', startedAt: Date.now() - 2500, elapsedMsBeforeStart: 0, laps: [1000] })

    render(StopwatchPanel)
    await flush()

    await fireEvent.click(screen.getByRole('button', { name: 'Lap' }))

    expect(await screen.findByText('Lap 2')).toBeInTheDocument()
    expect(screen.getByText('Lap 1')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('clears the display and the laps on reset', async () => {
    await store().set(paused(65_430, [1500, 1000]))

    render(StopwatchPanel)
    expect(await screen.findByText('Lap 2')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(await screen.findByText('00:00.00')).toBeInTheDocument()
    expect(screen.queryByText('Lap 2')).toBeNull()
    expect(await store().get()).toEqual({
      status: 'idle',
      startedAt: null,
      elapsedMsBeforeStart: 0,
      laps: [],
    })
  })

  it('picks up a change written by another view', async () => {
    render(StopwatchPanel)
    expect(await screen.findByText('00:00.00')).toBeInTheDocument()

    await store().set(paused(1_230))
    await flush()

    expect(await screen.findByText('00:01.23')).toBeInTheDocument()
  })

  it('reports a failed write and saves the next action', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('storage unavailable'))
    render(StopwatchPanel)
    await flush()

    await fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the stopwatch')

    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(async () => expect((await store().get()).status).toBe('paused'))
  })
})
