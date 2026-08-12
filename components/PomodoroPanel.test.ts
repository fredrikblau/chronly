import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPomodoro } from '../lib/core/scheduler'
import { createExtensionStorageBackend, RecordStore } from '../lib/core/storage'
import type { PomodoroConfig, PomodoroRecord } from '../lib/core/types'
import PomodoroPanel from './PomodoroPanel.svelte'

const CONFIG: PomodoroConfig = {
  focusMs: 25 * 60_000,
  shortBreakMs: 5 * 60_000,
  longBreakMs: 15 * 60_000,
  cyclesBeforeLongBreak: 4,
}

function newStore(): RecordStore {
  return new RecordStore(createExtensionStorageBackend('local'))
}

/** Writes a pomodoro straight to storage, the way the background worker would. */
async function seed(label: string, patch: Partial<PomodoroRecord> = {}): Promise<PomodoroRecord> {
  const record: PomodoroRecord = { ...createPomodoro(label, CONFIG, Date.now()), ...patch }
  await newStore().upsert(record)
  return record
}

/**
 * `records` is a module-level store whose last value outlives an unmount, so a
 * freshly rendered panel briefly shows the previous test's data. Waiting on the
 * seeded label pins the assertions to the record under test.
 */
async function renderSeeded(label: string): Promise<void> {
  render(PomodoroPanel)
  await screen.findByText(label)
}

async function storedPomodoro(): Promise<PomodoroRecord | undefined> {
  const all = await newStore().getAll()
  return all.find((r): r is PomodoroRecord => r.kind === 'pomodoro')
}

describe('PomodoroPanel', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('shows the start form when no pomodoro is active', async () => {
    render(PomodoroPanel)

    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Label')).toBeInTheDocument()
    expect(screen.getByLabelText('Focus minutes')).toHaveValue(25)
    expect(screen.getByLabelText('Short break minutes')).toHaveValue(5)
    expect(screen.getByLabelText('Long break minutes')).toHaveValue(15)
    expect(screen.getByLabelText('Rounds before a long break')).toHaveValue(4)
  })

  it('starts a pomodoro from the form', async () => {
    render(PomodoroPanel)

    await fireEvent.input(await screen.findByPlaceholderText('Label'), {
      target: { value: 'Deep work' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(await screen.findByText('Deep work')).toBeInTheDocument()
    expect(await screen.findByText('Focus')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })

  it('writes the configured durations onto the new record', async () => {
    render(PomodoroPanel)

    await fireEvent.input(await screen.findByLabelText('Focus minutes'), {
      target: { value: '30' },
    })
    await fireEvent.input(screen.getByLabelText('Short break minutes'), { target: { value: '7' } })
    await fireEvent.input(screen.getByLabelText('Long break minutes'), { target: { value: '20' } })
    await fireEvent.input(screen.getByLabelText('Rounds before a long break'), {
      target: { value: '3' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(async () => {
      expect((await storedPomodoro())?.config).toEqual({
        focusMs: 30 * 60_000,
        shortBreakMs: 7 * 60_000,
        longBreakMs: 20 * 60_000,
        cyclesBeforeLongBreak: 3,
      })
    })
  })

  it('applies a preset to the form fields', async () => {
    render(PomodoroPanel)

    await fireEvent.click(await screen.findByRole('button', { name: /Deep/ }))

    expect(screen.getByLabelText('Focus minutes')).toHaveValue(50)
    expect(screen.getByLabelText('Short break minutes')).toHaveValue(10)
  })

  it('falls back to a default label when none is given', async () => {
    render(PomodoroPanel)

    await fireEvent.click(await screen.findByRole('button', { name: 'Start' }))

    expect(await screen.findByText('Pomodoro session')).toBeInTheDocument()
  })

  it('shows an already-active pomodoro instead of the form', async () => {
    await seed('Writing')

    await renderSeeded('Writing')

    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })

  it('names the current phase for breaks too', async () => {
    await seed('Resting', { phase: 'longBreak', cycleCount: 4 })

    await renderSeeded('Resting')

    expect(screen.getByText('Long break')).toBeInTheDocument()
  })

  it('counts down the remaining time of the running phase', async () => {
    await seed('Counting')

    await renderSeeded('Counting')

    expect(screen.getByRole('timer')).toHaveTextContent(/^2[45]:\d\d$/)
  })

  it('shows the frozen remaining time while paused', async () => {
    await seed('Halted', { status: 'paused', remainingMsAtPause: 754_000 })

    await renderSeeded('Halted')

    expect(screen.getByRole('timer')).toHaveTextContent('12:34')
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  it('pauses a running pomodoro', async () => {
    await seed('Pausable')

    await renderSeeded('Pausable')
    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
    await waitFor(async () => expect((await storedPomodoro())?.status).toBe('paused'))
  })

  it('resumes a paused pomodoro', async () => {
    await seed('Resumable', { status: 'paused', remainingMsAtPause: 60_000 })

    await renderSeeded('Resumable')
    await fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    await waitFor(async () => expect((await storedPomodoro())?.status).toBe('running'))
  })

  it('stops the pomodoro and returns to the form', async () => {
    await seed('Stoppable')

    await renderSeeded('Stoppable')
    await fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
    await waitFor(async () => expect(await storedPomodoro()).toBeUndefined())
  })

  it('reflects a phase change written by the background worker', async () => {
    const record = await seed('Cycling')

    await renderSeeded('Cycling')
    expect(screen.getByText('Focus')).toBeInTheDocument()

    await newStore().upsert({
      ...record,
      phase: 'shortBreak',
      cycleCount: 1,
      targetTimestamp: Date.now() + CONFIG.shortBreakMs,
    })

    expect(await screen.findByText('Short break')).toBeInTheDocument()
  })

  it('describes how far through the current set of rounds the user is', async () => {
    await seed('Rounding', { phase: 'shortBreak', cycleCount: 2 })

    await renderSeeded('Rounding')

    expect(screen.getByRole('img', { name: '2 of 4 rounds done in this set' })).toBeInTheDocument()
  })

  it('shows the lifetime stats held in storage', async () => {
    await fakeBrowser.storage.local.set({
      pomodoroStats: { totalFocusSessionsCompleted: 3, totalFocusMs: 4_500_000 },
    })

    render(PomodoroPanel)

    await waitFor(() => expect(screen.getByText('Sessions').nextElementSibling).toHaveTextContent('3'))
    expect(screen.getByText('Focus time').nextElementSibling).toHaveTextContent('1h 15m')
  })

  it('picks up stats recorded by the background worker while open', async () => {
    render(PomodoroPanel)
    await waitFor(() => expect(screen.getByText('Sessions').nextElementSibling).toHaveTextContent('0'))

    await fakeBrowser.storage.local.set({
      pomodoroStats: { totalFocusSessionsCompleted: 1, totalFocusMs: 1_500_000 },
    })

    await waitFor(() => expect(screen.getByText('Sessions').nextElementSibling).toHaveTextContent('1'))
  })
})
