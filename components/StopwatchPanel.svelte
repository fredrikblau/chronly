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
  import { formatStopwatch } from '../lib/ui/format'
  import { failStorageLoad, finishStorageLoad } from '../lib/ui/storageLoad'
  import Icon from './Icon.svelte'

  interface Props {
    /** Whether the panel is on screen; keyboard shortcuts only apply then. */
    active?: boolean
  }

  const { active = false }: Props = $props()

  const store = new StopwatchStore(createExtensionStorageBackend('local'))
  let state = $state<StopwatchState>(DEFAULT_STOPWATCH)
  let stateRevision = 0
  let writeChain = Promise.resolve()
  let error = $state<string | null>(null)
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
      ? value.laps
          .filter((lap): lap is number => typeof lap === 'number' && Number.isFinite(lap))
          .map((lap) => Math.max(0, lap))
      : []
    return { status, startedAt, elapsedMsBeforeStart, laps }
  }

  async function hydrate() {
    const revisionAtStart = stateRevision
    let stored: StopwatchState
    try {
      stored = normalizeStopwatch(await store.get())
    } catch (error) {
      failStorageLoad('stopwatch', error)
      return
    }
    finishStorageLoad('stopwatch')
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

  const formatMs = formatStopwatch

  async function commit(next: StopwatchState) {
    stateRevision += 1
    const normalized = normalizeStopwatch(next)
    state = normalized
    elapsedMs = computeElapsedMs(normalized, Date.now())
    error = null
    const write = writeChain.then(() => store.set(normalized))
    writeChain = write.catch(() => undefined)
    try {
      await write
    } catch {
      error = 'Could not save the stopwatch. Try again.'
    }
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

  /** Space starts and pauses, L laps — only while this panel is showing and
   *  nothing that takes typing has focus. */
  function onKeydown(event: KeyboardEvent) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return
    const target = event.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    )
      return
    // A button would take Space for itself, except the tab that is already
    // selected, where Space has nothing left to do.
    const ownsSpace = target instanceof HTMLButtonElement && target.getAttribute('role') !== 'tab'
    if (event.key === ' ' && !ownsSpace) {
      event.preventDefault()
      toggle()
    } else if (event.key.toLowerCase() === 'l' && isRunning) {
      event.preventDefault()
      lap()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="panel" aria-labelledby="stopwatch-heading">
  <header class="panel-head">
    <h2 id="stopwatch-heading">Stopwatch</h2>
    {#if state.laps.length}<span class="panel-meta">{state.laps.length} laps</span>{/if}
  </header>

  <div class="readout card">
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
    <button
      type="button"
      class="btn"
      class:btn-primary={!isRunning}
      class:btn-outline={isRunning}
      aria-keyshortcuts="Space"
      onclick={toggle}
    >
      <Icon name={isRunning ? 'pause' : 'play'} size={isRunning ? 15 : 12} />
      {isRunning ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start'}
    </button>
    <button type="button" class="btn" aria-keyshortcuts="L" onclick={lap} disabled={!isRunning}>Lap</button>
    <button type="button" class="btn" onclick={reset} disabled={isPristine}>Reset</button>
  </div>

  {#if error}<p class="error-text" role="alert">{error}</p>{/if}

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

  .readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1.5rem 0.75rem 1.25rem;
  }

  .display {
    font-size: 3.25rem;
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

  .laps {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 14rem;
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
</style>
