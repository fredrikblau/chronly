<script lang="ts">
  import { onMount } from 'svelte'
  import {
    computeElapsedMs,
    pauseStopwatch,
    recordLap,
    resetStopwatch,
    startStopwatch,
    totalLappedMs,
  } from '../lib/core/stopwatch'
  import { createExtensionStorageBackend, StopwatchStore, watchStorageKey } from '../lib/core/storage'
  import { DEFAULT_STOPWATCH, type StopwatchState } from '../lib/core/types'

  const store = new StopwatchStore(createExtensionStorageBackend('local'))
  let state = $state<StopwatchState>(DEFAULT_STOPWATCH)
  let stateRevision = 0
  let writeChain = Promise.resolve()
  // Keep the render clock local to this panel. The persisted timestamp remains
  // the authority when the popup is closed and reopened.
  let elapsedMs = $state(0)

  // Centisecond digits need a faster tick than the wall clock's to read as a
  // stopwatch rather than a stutter.
  $effect(() => {
    const id = window.setInterval(() => (elapsedMs = computeElapsedMs(state, Date.now())), 50)
    return () => window.clearInterval(id)
  })

  function normalizeStopwatch(value: StopwatchState | undefined): StopwatchState {
    const status = value?.status === 'running' || value?.status === 'paused' ? value.status : 'idle'
    const startedAt = typeof value?.startedAt === 'number' && Number.isFinite(value.startedAt) ? value.startedAt : null
    const elapsedMsBeforeStart =
      typeof value?.elapsedMsBeforeStart === 'number' && Number.isFinite(value.elapsedMsBeforeStart)
        ? Math.max(0, value.elapsedMsBeforeStart)
        : 0
    const laps = Array.isArray(value?.laps)
      ? value.laps.filter((lap): lap is number => typeof lap === 'number' && Number.isFinite(lap)).map((lap) => Math.max(0, lap))
      : []
    return { status, startedAt, elapsedMsBeforeStart, laps }
  }

  async function hydrate() {
    const revisionAtStart = stateRevision
    const stored = normalizeStopwatch(await store.get())
    if (revisionAtStart !== stateRevision) return
    state = stored
    elapsedMs = computeElapsedMs(stored, Date.now())
  }

  onMount(() => {
    void hydrate()
  })

  // Another view (a second popup, an options page) may own the stopwatch too;
  // storage is the single source of truth, so mirror its changes back in.
  $effect(() =>
    watchStorageKey<StopwatchState>('stopwatch', (value) => {
      if (value === undefined) return
      const next = normalizeStopwatch(value)
      stateRevision += 1
      state = next
      elapsedMs = computeElapsedMs(next, Date.now())
    }),
  )

  const isRunning = $derived(state.status === 'running')
  const isPristine = $derived(state.status === 'idle' && state.laps.length === 0)
  const currentLapMs = $derived(Math.max(0, elapsedMs - totalLappedMs(state)))

  interface LapRow {
    number: number
    splitMs: number
    totalMs: number
  }

  const lapRows: LapRow[] = $derived.by(() => {
    const rows: LapRow[] = []
    let cumulative = totalLappedMs(state)
    for (let i = 0; i < state.laps.length; i++) {
      rows.push({ number: state.laps.length - i, splitMs: state.laps[i], totalMs: cumulative })
      cumulative -= state.laps[i]
    }
    return rows
  })

  const fastestLapMs = $derived(state.laps.length > 1 ? Math.min(...state.laps) : null)
  const slowestLapMs = $derived(state.laps.length > 1 ? Math.max(...state.laps) : null)

  function pad(value: number, width = 2): string {
    return String(value).padStart(width, '0')
  }

  function formatMs(ms: number): string {
    const totalCentis = Math.floor(ms / 10)
    const centis = totalCentis % 100
    const totalSeconds = Math.floor(totalCentis / 100)
    const seconds = totalSeconds % 60
    const totalMinutes = Math.floor(totalSeconds / 60)
    const minutes = totalMinutes % 60
    const hours = Math.floor(totalMinutes / 60)
    const head = hours > 0 ? `${hours}:${pad(minutes)}` : pad(minutes)
    return `${head}:${pad(seconds)}.${pad(centis)}`
  }

  async function commit(next: StopwatchState) {
    stateRevision += 1
    const normalized = normalizeStopwatch(next)
    state = normalized
    elapsedMs = computeElapsedMs(normalized, Date.now())
    writeChain = writeChain.then(() => store.set(normalized))
    await writeChain
  }

  function toggle() {
    const at = Date.now()
    void commit(isRunning ? pauseStopwatch(state, at) : startStopwatch(state, at))
  }

  function lap() {
    void commit(recordLap(state, Date.now()))
  }

  function reset() {
    void commit(resetStopwatch())
  }
</script>

<section class="panel" aria-labelledby="stopwatch-heading">
  <h2 id="stopwatch-heading">Stopwatch</h2>

  <div class="readout">
    <div class="display" class:is-idle={!isRunning} role="timer" aria-live="off">
      {formatMs(elapsedMs)}
    </div>
    {#if state.laps.length > 0}
      <div class="current-lap">
        <span class="current-lap-name">Lap {state.laps.length + 1}</span>
        <span class="current-lap-time">{formatMs(currentLapMs)}</span>
      </div>
    {/if}
  </div>

  <div class="controls">
    <button type="button" class="primary" class:is-running={isRunning} onclick={toggle}>
      {isRunning ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start'}
    </button>
    <button type="button" class="ghost" onclick={lap} disabled={!isRunning}>Lap</button>
    <button type="button" class="ghost" onclick={reset} disabled={isPristine}>Reset</button>
  </div>

  {#if lapRows.length > 0}
    <ol class="laps" aria-label="Recorded laps">
      {#each lapRows as row (row.number)}
        <li
          class:is-fastest={fastestLapMs !== null && row.splitMs === fastestLapMs}
          class:is-slowest={slowestLapMs !== null && row.splitMs === slowestLapMs && slowestLapMs !== fastestLapMs}
        >
          <span class="lap-name">Lap {row.number}</span>
          <span class="lap-split">{formatMs(row.splitMs)}</span>
          <span class="lap-total">{formatMs(row.totalMs)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .panel {
    /* The popup root owns these; the fallbacks only matter when a panel is
       mounted on its own, as the tests do. */
    --surface: var(--tint, rgba(255, 255, 255, 0.04));
    --line: var(--hairline, rgba(255, 255, 255, 0.1));
    --muted: var(--fg-muted, rgba(245, 245, 247, 0.55));
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    color: var(--fg, #f5f5f7);
  }

  h2 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.9rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  .display {
    font-size: 2.5rem;
    font-weight: 250;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    line-height: 1.05;
  }

  .display.is-idle {
    color: var(--muted);
  }

  .current-lap {
    display: flex;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .current-lap-time {
    color: var(--accent-ink, #8b7cf6);
  }

  .controls {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 0.4rem;
  }

  button {
    padding: 0.5rem 0.6rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .primary {
    background: var(--accent, #8b7cf6);
    color: var(--on-accent, #0b0b0f);
    font-weight: 600;
  }

  .primary:hover {
    background: color-mix(in srgb, var(--accent, #8b7cf6) 85%, #ffffff);
  }

  .primary.is-running {
    background: transparent;
    border-color: var(--accent, #8b7cf6);
    color: var(--accent-ink, #8b7cf6);
  }

  .primary.is-running:hover {
    background: color-mix(in srgb, var(--accent, #8b7cf6) 14%, transparent);
  }

  .ghost {
    background: var(--tint, rgba(255, 255, 255, 0.06));
    border-color: var(--line);
    color: var(--muted);
  }

  .ghost:hover:not(:disabled) {
    background: var(--tint-strong, rgba(255, 255, 255, 0.12));
    color: var(--fg, #f5f5f7);
  }

  .ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .laps {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 9rem;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  .laps li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .laps li + li {
    border-top: 1px solid var(--hairline, rgba(255, 255, 255, 0.06));
  }

  .lap-name {
    color: var(--muted);
  }

  .lap-total {
    min-width: 5.5rem;
    text-align: right;
    color: var(--muted);
  }

  .laps li.is-fastest .lap-split {
    color: var(--success, #6ee7b7);
  }

  .laps li.is-slowest .lap-split {
    color: var(--danger, #fca5a5);
  }

  :is(button):focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
