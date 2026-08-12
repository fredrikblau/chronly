import type { StopwatchState } from './types'

/**
 * Elapsed time is always derived from an absolute start timestamp plus the
 * total banked before that start — never from an incrementing counter. The
 * popup that owns the ticking display is torn down every time the user closes
 * it, so a counter would silently reset; a timestamp keeps counting whether or
 * not anything is watching.
 */
export function computeElapsedMs(state: StopwatchState, now: number): number {
  if (state.status === 'running' && state.startedAt !== null) {
    return state.elapsedMsBeforeStart + Math.max(0, now - state.startedAt)
  }
  return state.elapsedMsBeforeStart
}

/** Total of the recorded lap splits — i.e. elapsed time at the last lap. */
export function totalLappedMs(state: StopwatchState): number {
  return state.laps.reduce((sum, lap) => sum + lap, 0)
}

export function startStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.status === 'running') return state
  return { ...state, status: 'running', startedAt: now }
}

export function pauseStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.status !== 'running') return state
  return {
    ...state,
    status: 'paused',
    elapsedMsBeforeStart: computeElapsedMs(state, now),
    startedAt: null,
  }
}

export function resetStopwatch(): StopwatchState {
  return { status: 'idle', startedAt: null, elapsedMsBeforeStart: 0, laps: [] }
}

/**
 * Laps are stored as splits (the duration of that lap alone), newest first,
 * because the running total is trivially recoverable by summing them while the
 * reverse — recovering a split from two cumulative values — is not once the
 * list has been trimmed or reordered for display.
 */
export function recordLap(state: StopwatchState, now: number): StopwatchState {
  if (state.status === 'idle') return state
  const split = computeElapsedMs(state, now) - totalLappedMs(state)
  return { ...state, laps: [Math.max(0, split), ...state.laps] }
}
