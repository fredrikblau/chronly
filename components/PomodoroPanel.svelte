<script lang="ts">
  import { createPomodoro, pauseRecord, resumeRecord } from '../lib/core/scheduler'
  import { createExtensionStorageBackend, PomodoroStatsStore, watchStorageKey } from '../lib/core/storage'
  import {
    DEFAULT_POMODORO_STATS,
    type PomodoroConfig,
    type PomodoroRecord,
    type PomodoroStats,
  } from '../lib/core/types'
  import { downloadIcs, openGoogleCalendarLink } from '../lib/ui/calendarAction'
  import { createNowStore } from '../lib/ui/now'
  import { recordActions, records } from '../lib/ui/records'
  import SoundPicker from './SoundPicker.svelte'

  interface Preset {
    name: string
    focus: number
    shortBreak: number
    longBreak: number
    rounds: number
  }

  const PRESETS: Preset[] = [
    { name: 'Classic', focus: 25, shortBreak: 5, longBreak: 15, rounds: 4 },
    { name: 'Deep', focus: 50, shortBreak: 10, longBreak: 25, rounds: 3 },
    { name: 'Sprint', focus: 15, shortBreak: 3, longBreak: 10, rounds: 4 },
  ]

  const PHASE_LABELS: Record<PomodoroRecord['phase'], string> = {
    focus: 'Focus',
    shortBreak: 'Short break',
    longBreak: 'Long break',
  }

  // A render clock only. The background worker owns every phase transition and
  // the stats that follow from it; this panel just re-reads what it wrote.
  const now = createNowStore()
  const statsStore = new PomodoroStatsStore(createExtensionStorageBackend('local'))

  let focusMinutes = $state(25)
  let shortBreakMinutes = $state(5)
  let longBreakMinutes = $state(15)
  let roundsBeforeLongBreak = $state(4)
  let label = $state('')
  let stats = $state<PomodoroStats>(DEFAULT_POMODORO_STATS)
  let soundId = $state('default')
  let volume = $state(0.8)

  $effect(() => {
    let live = true
    void statsStore.get().then((value) => {
      if (live) stats = value
    })
    // The worker credits a finished focus session straight to storage, so the
    // open panel has to watch the key rather than read it once on mount.
    const unwatch = watchStorageKey<PomodoroStats>('pomodoroStats', (value) => {
      stats = value ?? DEFAULT_POMODORO_STATS
    })
    return () => {
      live = false
      unwatch()
    }
  })

  const active = $derived($records.find((r): r is PomodoroRecord => r.kind === 'pomodoro'))
  const activePreset = $derived(
    PRESETS.find(
      (p) =>
        p.focus === focusMinutes &&
        p.shortBreak === shortBreakMinutes &&
        p.longBreak === longBreakMinutes &&
        p.rounds === roundsBeforeLongBreak,
    )?.name,
  )

  /** Guards against the empty/NaN value a cleared number input binds through. */
  function minutes(value: number, fallback: number): number {
    return Number.isFinite(value) && value >= 1 ? Math.round(value) : fallback
  }

  function start() {
    const config: PomodoroConfig = {
      focusMs: minutes(focusMinutes, 25) * 60_000,
      shortBreakMs: minutes(shortBreakMinutes, 5) * 60_000,
      longBreakMs: minutes(longBreakMinutes, 15) * 60_000,
      cyclesBeforeLongBreak: minutes(roundsBeforeLongBreak, 4),
    }
    void recordActions.upsert(createPomodoro(label.trim() || 'Pomodoro session', config, Date.now(), { soundId, volume }))
    label = ''
  }

  function applyPreset(preset: Preset) {
    focusMinutes = preset.focus
    shortBreakMinutes = preset.shortBreak
    longBreakMinutes = preset.longBreak
    roundsBeforeLongBreak = preset.rounds
  }

  function togglePause(record: PomodoroRecord) {
    const at = Date.now()
    void recordActions.upsert(record.status === 'running' ? pauseRecord(record, at) : resumeRecord(record, at))
  }

  function phaseDurationMs(record: PomodoroRecord): number {
    if (record.phase === 'focus') return record.config.focusMs
    return record.phase === 'shortBreak' ? record.config.shortBreakMs : record.config.longBreakMs
  }

  function remainingMs(record: PomodoroRecord, at: number): number {
    if (record.status === 'running') return Math.max(0, record.targetTimestamp - at)
    return Math.max(0, record.remainingMsAtPause ?? 0)
  }

  function formatRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000)
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
  }

  function spokenRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return m > 0 ? `${m} min ${s} sec remaining` : `${s} sec remaining`
  }

  function formatTotalFocus(ms: number): string {
    const totalMinutes = Math.round(ms / 60_000)
    const hours = Math.floor(totalMinutes / 60)
    const rest = totalMinutes % 60
    return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
  }

  /**
   * `cycleCount` counts *finished* focus sessions, so mid-focus it is still the
   * previous round's number and a break belongs to the round that just ended.
   */
  function roundsDone(record: PomodoroRecord): number {
    const perSet = Math.max(1, record.config.cyclesBeforeLongBreak)
    if (record.phase === 'focus') return record.cycleCount % perSet
    return record.cycleCount > 0 ? ((record.cycleCount - 1) % perSet) + 1 : 0
  }

  /**
   * Blocks out the rest of the current phase. A paused record's
   * `targetTimestamp` is stale, so the span comes from the remaining time the
   * dial is showing, and never collapses to a zero-length event.
   */
  function phaseEvent(record: PomodoroRecord) {
    const at = Date.now()
    return {
      title: `${record.label} — ${PHASE_LABELS[record.phase]}`,
      start: new Date(at),
      end: new Date(at + Math.max(remainingMs(record, at), 60_000)),
      description: 'Chronly pomodoro session',
    }
  }

  function addToGoogleCalendar(record: PomodoroRecord) {
    const { title, start, end, description } = phaseEvent(record)
    openGoogleCalendarLink(title, start, end, description)
  }

  function saveIcs(record: PomodoroRecord) {
    const { title, start, end, description } = phaseEvent(record)
    downloadIcs(title, start, end, description)
  }

  const RING_RADIUS = 46
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS
</script>

<section class="panel" aria-labelledby="pomodoro-heading">
  <header class="head">
    <h2 id="pomodoro-heading">Pomodoro</h2>
    <dl class="stats">
      <div class="stat">
        <dt>Sessions</dt>
        <dd>{stats.totalFocusSessionsCompleted}</dd>
      </div>
      <div class="stat">
        <dt>Focus time</dt>
        <dd>{formatTotalFocus(stats.totalFocusMs)}</dd>
      </div>
    </dl>
  </header>

  {#if active}
    {@const remaining = remainingMs(active, $now)}
    {@const total = phaseDurationMs(active)}
    {@const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0}
    {@const perSet = Math.max(1, active.config.cyclesBeforeLongBreak)}
    {@const done = roundsDone(active)}

    <div class="running" data-phase={active.phase} class:paused={active.status !== 'running'}>
      <p class="phase">{PHASE_LABELS[active.phase]}</p>
      <p class="label" title={active.label}>{active.label}</p>

      <div class="dial">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="track" cx="50" cy="50" r={RING_RADIUS} />
          <circle
            class="progress"
            cx="50"
            cy="50"
            r={RING_RADIUS}
            stroke-dasharray={RING_LENGTH}
            stroke-dashoffset={RING_LENGTH * (1 - fraction)}
          />
        </svg>
        <div class="readout">
          <span
            class="countdown"
            role="timer"
            aria-live="off"
            aria-label={`${PHASE_LABELS[active.phase]}, ${spokenRemaining(remaining)}`}
          >
            {formatRemaining(remaining)}
          </span>
          {#if active.status !== 'running'}<span class="paused-flag">Paused</span>{/if}
        </div>
      </div>

      <div class="rounds" role="img" aria-label={`${done} of ${perSet} rounds done in this set`}>
        {#each { length: perSet }, i (i)}
          <span class="round" class:filled={i < done}></span>
        {/each}
      </div>

      <div class="controls">
        <button type="button" class="primary" onclick={() => togglePause(active)}>
          {active.status === 'running' ? 'Pause' : 'Resume'}
        </button>
        <button type="button" class="ghost" onclick={() => void recordActions.remove(active.id)}> Stop </button>
      </div>

      <div class="calendarRow" role="group" aria-label="Add this phase to a calendar">
        <button
          type="button"
          class="ghost"
          aria-label={`Add ${PHASE_LABELS[active.phase]} end to Google Calendar`}
          onclick={() => addToGoogleCalendar(active)}
        >
          Google Calendar
        </button>
        <button
          type="button"
          class="ghost"
          aria-label={`Download the .ics calendar file for ${PHASE_LABELS[active.phase]} end`}
          onclick={() => saveIcs(active)}
        >
          Download .ics
        </button>
      </div>
    </div>
  {:else}
    <form
      class="setup"
      onsubmit={(event) => {
        event.preventDefault()
        start()
      }}
    >
      <input class="label-input" type="text" placeholder="Label" bind:value={label} />

      <div class="presets" role="group" aria-label="Presets">
        {#each PRESETS as preset (preset.name)}
          <button
            type="button"
            class="chip"
            aria-pressed={activePreset === preset.name}
            onclick={() => applyPreset(preset)}
          >
            {preset.name}
            <span class="chip-detail">{preset.focus}/{preset.shortBreak}</span>
          </button>
        {/each}
      </div>

      <div class="fields">
        <label class="field">
          <span>Focus</span>
          <input type="number" min="1" max="180" aria-label="Focus minutes" bind:value={focusMinutes} />
          <span class="unit">min</span>
        </label>
        <label class="field">
          <span>Short break</span>
          <input type="number" min="1" max="60" aria-label="Short break minutes" bind:value={shortBreakMinutes} />
          <span class="unit">min</span>
        </label>
        <label class="field">
          <span>Long break</span>
          <input type="number" min="1" max="120" aria-label="Long break minutes" bind:value={longBreakMinutes} />
          <span class="unit">min</span>
        </label>
        <label class="field">
          <span>Rounds</span>
          <input
            type="number"
            min="1"
            max="12"
            aria-label="Rounds before a long break"
            bind:value={roundsBeforeLongBreak}
          />
          <span class="unit">to long break</span>
        </label>
      </div>

      <div class="sound-field">
        <span class="fieldLabel">Completion sound</span>
        <SoundPicker bind:soundId bind:volume />
      </div>

      <button type="submit" class="primary start">Start</button>
    </form>
  {/if}
</section>

<style>
  .panel {
    --phase: var(--accent, #8b7cf6);
    /* The popup root owns these; the fallbacks only matter when a panel is
       mounted on its own, as the tests do. */
    --surface: var(--tint, rgba(255, 255, 255, 0.05));
    --line: var(--hairline, rgba(245, 245, 247, 0.12));
    --muted: var(--fg-muted, rgba(245, 245, 247, 0.58));
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    width: 100%;
    color: var(--fg, #f5f5f7);
    font-family: inherit;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .stats {
    display: flex;
    gap: 0.9rem;
    margin: 0;
  }

  .stat {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
  }

  .stats dt {
    font-size: 0.68rem;
    color: var(--muted);
  }

  .stats dd {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* Running view */
  .running {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
    padding: 1rem 0.75rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 1rem;
    background:
      radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--phase) 14%, transparent), transparent 70%),
      var(--surface);
  }

  .running[data-phase='focus'] {
    --phase: var(--accent-ink, #8b7cf6);
  }
  .running[data-phase='shortBreak'] {
    --phase: var(--phase-short, #4ec9b0);
  }
  .running[data-phase='longBreak'] {
    --phase: var(--phase-long, #5aa9f7);
  }
  .running.paused {
    --phase: var(--fg-muted, rgba(245, 245, 247, 0.45));
  }

  .phase {
    margin: 0;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--phase) 20%, transparent);
    color: var(--phase);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .label {
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
    font-weight: 500;
  }

  .dial {
    position: relative;
    width: 10.5rem;
    height: 10.5rem;
  }

  .dial svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .track {
    fill: none;
    stroke: var(--hairline, rgba(245, 245, 247, 0.1));
    stroke-width: 5;
  }

  .progress {
    fill: none;
    stroke: var(--phase);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.25s linear;
  }

  .readout {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
  }

  .countdown {
    font-size: 2.4rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    line-height: 1;
  }

  .paused-flag {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .rounds {
    display: flex;
    gap: 0.32rem;
  }

  .round {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 50%;
    border: 1px solid var(--phase);
    opacity: 0.45;
  }

  .round.filled {
    background: var(--phase);
    opacity: 1;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    margin-top: 0.2rem;
  }

  .controls button {
    flex: 1;
  }

  .calendarRow {
    display: flex;
    gap: 0.4rem;
    width: 100%;
  }

  .calendarRow button {
    flex: 1 1 0;
    min-width: 0;
    padding: 0.38rem 0.5rem;
    overflow: hidden;
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Setup view */
  .setup {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .label-input {
    width: 100%;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 0.6rem;
    background: var(--surface);
    color: inherit;
    font: inherit;
    font-size: 0.88rem;
  }

  .label-input::placeholder {
    color: var(--muted);
  }

  .presets {
    display: flex;
    gap: 0.4rem;
  }

  .chip {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.35rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: 0.6rem;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
  }

  .chip-detail {
    font-size: 0.64rem;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .chip[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--accent, #8b7cf6) 60%, transparent);
    background: color-mix(in srgb, var(--accent, #8b7cf6) 16%, transparent);
    color: var(--fg, #f5f5f7);
  }

  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .field {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 0.6rem;
    background: var(--surface);
    font-size: 0.7rem;
    color: var(--muted);
  }

  .field > span:first-child {
    flex: 1;
    white-space: nowrap;
  }

  .sound-field { width: 100%; }
  .sound-field > .fieldLabel { display: block; margin-bottom: 0.35rem; font-size: 0.72rem; color: var(--muted); }

  .field input {
    width: 2.6rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--fg, #f5f5f7);
    font: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .unit {
    font-size: 0.62rem;
    white-space: nowrap;
  }

  /* Buttons */
  button {
    cursor: pointer;
  }

  .primary,
  .ghost {
    padding: 0.5rem 0.9rem;
    border-radius: 0.6rem;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .primary {
    border: none;
    background: var(--accent, #8b7cf6);
    color: var(--on-accent, #0b0b0f);
  }

  .ghost {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
  }

  .start {
    width: 100%;
    margin-top: 0.1rem;
  }

  button:hover {
    filter: brightness(1.12);
  }

  .ghost:hover {
    color: var(--fg, #f5f5f7);
    border-color: color-mix(in srgb, var(--fg, #f5f5f7) 30%, transparent);
  }

  :where(button, input):focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress {
      transition: none;
    }
  }
</style>
