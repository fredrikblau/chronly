import { describe, expect, it } from 'vitest'
import { computeElapsedMs, pauseStopwatch, recordLap, resetStopwatch, startStopwatch, totalLappedMs } from './stopwatch'
import { DEFAULT_STOPWATCH } from './types'

const NOW = 1_770_000_000_000

describe('stopwatch state machine', () => {
  it('accumulates elapsed time across a start/pause/start cycle', () => {
    let state = startStopwatch(DEFAULT_STOPWATCH, NOW)
    expect(computeElapsedMs(state, NOW + 1000)).toBe(1000)

    state = pauseStopwatch(state, NOW + 1000)
    expect(computeElapsedMs(state, NOW + 5000)).toBe(1000) // frozen while paused

    state = startStopwatch(state, NOW + 5000)
    expect(computeElapsedMs(state, NOW + 5500)).toBe(1500)
  })

  it('reports zero elapsed time while idle', () => {
    expect(computeElapsedMs(DEFAULT_STOPWATCH, NOW + 10_000)).toBe(0)
  })

  it('ignores a second start while already running', () => {
    const running = startStopwatch(DEFAULT_STOPWATCH, NOW)
    expect(startStopwatch(running, NOW + 3000)).toBe(running)
    expect(computeElapsedMs(startStopwatch(running, NOW + 3000), NOW + 4000)).toBe(4000)
  })

  it('ignores a pause when not running', () => {
    expect(pauseStopwatch(DEFAULT_STOPWATCH, NOW)).toBe(DEFAULT_STOPWATCH)
  })

  it('records laps as split times, newest first', () => {
    let state = startStopwatch(DEFAULT_STOPWATCH, NOW)
    state = recordLap(state, NOW + 1000)
    state = recordLap(state, NOW + 2500)
    expect(state.laps).toEqual([1500, 1000])
  })

  it('keeps lap splits correct across a pause', () => {
    let state = startStopwatch(DEFAULT_STOPWATCH, NOW)
    state = recordLap(state, NOW + 1000)
    state = pauseStopwatch(state, NOW + 2000)
    state = startStopwatch(state, NOW + 60_000) // long gap while paused
    state = recordLap(state, NOW + 60_500)
    expect(state.laps).toEqual([1500, 1000])
  })

  it('does not record a lap while idle', () => {
    expect(recordLap(DEFAULT_STOPWATCH, NOW).laps).toEqual([])
  })

  it('sums recorded lap splits', () => {
    expect(totalLappedMs({ ...DEFAULT_STOPWATCH, laps: [1500, 1000] })).toBe(2500)
  })

  it('resets to a clean idle state', () => {
    let state = startStopwatch(DEFAULT_STOPWATCH, NOW)
    state = recordLap(state, NOW + 1000)
    state = pauseStopwatch(state, NOW + 2000)
    expect(state).not.toEqual(DEFAULT_STOPWATCH)
    expect(resetStopwatch()).toEqual(DEFAULT_STOPWATCH)
  })

  it('returns a fresh laps array on reset so the default is never aliased', () => {
    expect(resetStopwatch().laps).not.toBe(DEFAULT_STOPWATCH.laps)
  })
})
