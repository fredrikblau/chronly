<script lang="ts">
  import { createPomodoro, pauseRecord, resumeRecord, skipPomodoroPhase } from '../lib/core/scheduler'
  import { createExtensionStorageBackend, localDayKey, PomodoroStatsStore, watchStorageKey } from '../lib/core/storage'
  import {
    DEFAULT_POMODORO_STATS,
    type PomodoroConfig,
    type PomodoroRecord,
    type PomodoroStats,
  } from '../lib/core/types'
  import { downloadIcs, openGoogleCalendarLink } from '../lib/ui/calendarAction'
  import { formatCountdown, formatSpent, spokenCountdown } from '../lib/ui/format'
  import { createNowStore } from '../lib/ui/now'
  import { recordActions, records } from '../lib/ui/records'
  import { loadStorage } from '../lib/ui/storageLoad'
  import Icon from './Icon.svelte'
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
  let error = $state<string | null>(null)
  let saving = $state(false)

  $effect(() => {
    let live = true
    loadStorage('Pomodoro stats', statsStore.get(), (value) => {
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

  async function save(action: () => Promise<void>, failure: string): Promise<boolean> {
    if (saving) return false
    saving = true
    error = null
    try {
      await action()
      return true
    } catch {
      error = failure
      return false
    } finally {
      saving = false
    }
  }

  async function start() {
    const config: PomodoroConfig = {
      focusMs: minutes(focusMinutes, 25) * 60_000,
      shortBreakMs: minutes(shortBreakMinutes, 5) * 60_000,
      longBreakMs: minutes(longBreakMinutes, 15) * 60_000,
      cyclesBeforeLongBreak: minutes(roundsBeforeLongBreak, 4),
    }
    if (
      !(await save(
        () =>
          recordActions.upsert(
            createPomodoro(label.trim() || 'Pomodoro session', config, Date.now(), { soundId, volume }),
          ),
        'Could not start the Pomodoro. Try again.',
      ))
    )
      return
    label = ''
  }

  function applyPreset(preset: Preset) {
    focusMinutes = preset.focus
    shortBreakMinutes = preset.shortBreak
    longBreakMinutes = preset.longBreak
    roundsBeforeLongBreak = preset.rounds
  }

  async function togglePause(record: PomodoroRecord) {
    const at = Date.now()
    const updated = record.status === 'running' ? pauseRecord(record, at) : resumeRecord(record, at)
    await save(() => recordActions.upsert(updated), 'Could not update the Pomodoro. Try again.')
  }

  async function stop(record: PomodoroRecord) {
    await save(() => recordActions.remove(record.id), 'Could not stop the Pomodoro. Try again.')
  }

  function phaseDurationMs(record: PomodoroRecord): number {
    if (record.phase === 'focus') return record.config.focusMs
    return record.phase === 'shortBreak' ? record.config.shortBreakMs : record.config.longBreakMs
  }

  function remainingMs(record: PomodoroRecord, at: number): number {
    if (record.status === 'running') return Math.max(0, record.targetTimestamp - at)
    return Math.max(0, record.remainingMsAtPause ?? 0)
  }

  const formatRemaining = formatCountdown
  const spokenRemaining = spokenCountdown
  const formatTotalFocus = formatSpent

  async function skip(record: PomodoroRecord) {
    await save(() => recordActions.upsert(skipPomodoroPhase(record, Date.now())), 'Could not skip ahead. Try again.')
  }

  // Only changes at midnight, so the week below is rebuilt once a day rather
  // than on every render tick.
  const todayKey = $derived(localDayKey($now))

  /** The last seven local days, oldest first, for the week chart. */
  const week = $derived.by(() => {
    const [year, month, date] = todayKey.split('-').map(Number)
    const today = new Date(year!, month! - 1, date!)
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i), 12)
      const entry = stats.daily?.[localDayKey(day.getTime())]
      return {
        key: localDayKey(day.getTime()),
        initial: day.toLocaleDateString(undefined, { weekday: 'narrow' }),
        name: day.toLocaleDateString(undefined, { weekday: 'long' }),
        sessions: entry?.sessions ?? 0,
        focusMs: entry?.focusMs ?? 0,
      }
    })
  })
  const today = $derived(week[6]!)
  const weekMax = $derived(Math.max(1, ...week.map((day) => day.sessions)))
  const weekTotal = $derived(week.reduce((sum, day) => sum + day.sessions, 0))

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
  <header class="panel-head">
    <h2 id="pomodoro-heading">Pomodoro</h2>
    <span class="panel-meta">{today.sessions} today</span>
  </header>

  {#if active}
    {@const remaining = remainingMs(active, $now)}
    {@const total = phaseDurationMs(active)}
    {@const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0}
    {@const perSet = Math.max(1, active.config.cyclesBeforeLongBreak)}
    {@const done = roundsDone(active)}

    <div class="running card" data-phase={active.phase} class:paused={active.status !== 'running'}>
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
        <button
          type="button"
          class="btn grow"
          class:btn-primary={active.status !== 'running'}
          class:btn-outline={active.status === 'running'}
          disabled={saving}
          onclick={() => void togglePause(active)}
        >
          <Icon name={active.status === 'running' ? 'pause' : 'play'} size={active.status === 'running' ? 15 : 12} />
          {active.status === 'running' ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          class="btn"
          disabled={saving}
          title={active.phase === 'focus' ? 'Start the break now' : 'Start focusing now'}
          aria-label={active.phase === 'focus' ? 'Skip to break' : 'Skip to focus'}
          onclick={() => void skip(active)}
        >
          <Icon name="skip" size={14} /> Skip
        </button>
        <button type="button" class="btn btn-danger" disabled={saving} onclick={() => void stop(active)}>
          <Icon name="stop" size={14} /> Stop
        </button>
      </div>

      <div class="calendarRow" role="group" aria-label="Add this phase to a calendar">
        <button
          type="button"
          class="btn btn-quiet btn-sm"
          aria-label={`Add ${PHASE_LABELS[active.phase]} end to Google Calendar`}
          onclick={() => addToGoogleCalendar(active)}
        >
          <Icon name="calendar" size={13} /> Google Calendar
        </button>
        <button
          type="button"
          class="btn btn-quiet btn-sm"
          aria-label={`Download the .ics calendar file for ${PHASE_LABELS[active.phase]} end`}
          onclick={() => saveIcs(active)}
        >
          <Icon name="download" size={13} /> Download .ics
        </button>
      </div>
    </div>
  {:else}
    <form
      class="setup card"
      onsubmit={(event) => {
        event.preventDefault()
        start()
      }}
    >
      <input
        class="input label-input"
        type="text"
        placeholder="Label"
        aria-label="Session label"
        maxlength="80"
        disabled={saving}
        bind:value={label}
      />

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
        <span class="field-label">Completion sound</span>
        <SoundPicker bind:soundId bind:volume />
      </div>

      <button type="submit" class="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving…' : 'Start'}
      </button>
    </form>
  {/if}

  {#if error}<p class="error-text" role="alert">{error}</p>{/if}

  <section class="stats card" aria-labelledby="focus-stats-heading">
    <h3 id="focus-stats-heading" class="section-title">Your focus</h3>
    <dl class="tiles">
      <div class="tile">
        <dt>Today</dt>
        <dd>{today.sessions}<small>{formatTotalFocus(today.focusMs)}</small></dd>
      </div>
      <div class="tile">
        <dt>Sessions</dt>
        <dd>{stats.totalFocusSessionsCompleted}</dd>
      </div>
      <div class="tile">
        <dt>Focus time</dt>
        <dd>{formatTotalFocus(stats.totalFocusMs)}</dd>
      </div>
    </dl>
    <figure class="week">
      <figcaption class="hint">Last 7 days · {weekTotal} sessions</figcaption>
      <div class="bars" aria-hidden="true">
        {#each week as day (day.key)}
          <div class="bar-col" title={`${day.name}: ${day.sessions} sessions, ${formatTotalFocus(day.focusMs)}`}>
            <div class="bar-track">
              <div
                class="bar"
                class:empty={day.sessions === 0}
                style:height={day.sessions === 0 ? '2px' : `${(day.sessions / weekMax) * 100}%`}
              ></div>
            </div>
            <span class="bar-label" class:is-today={day === today}>{day.initial}</span>
          </div>
        {/each}
      </div>
      <table class="sr-only">
        <caption>Focus sessions over the last 7 days</caption>
        <thead
          ><tr><th scope="col">Day</th><th scope="col">Completed sessions</th><th scope="col">Time focused</th></tr
          ></thead
        >
        <tbody>
          {#each week as day (day.key)}
            <tr><th scope="row">{day.name}</th><td>{day.sessions}</td><td>{formatTotalFocus(day.focusMs)}</td></tr>
          {/each}
        </tbody>
      </table>
    </figure>
  </section>
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

  /* Running view */
  .running {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
    padding: 1rem 0.85rem 0.75rem;
    border-radius: var(--radius-lg, 1rem);
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

  .grow {
    flex: 1;
  }

  .calendarRow {
    display: flex;
    gap: 0.4rem;
    width: 100%;
  }

  .calendarRow {
    justify-content: center;
  }

  /* Setup view */
  .setup {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.85rem;
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

  .sound-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

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

  /* Stats */
  .stats {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem 0.85rem;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    margin: 0;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .tile dt {
    color: var(--muted);
    font-size: 0.7rem;
  }

  .tile dd {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    margin: 0;
    font-size: 1.25rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .tile small {
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 400;
  }

  .week {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
  }

  .bars {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.4rem;
    height: 4.25rem;
  }

  .bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-height: 0;
  }

  .bar-track {
    display: flex;
    flex: 1;
    align-items: flex-end;
    justify-content: center;
    width: 100%;
    min-height: 0;
    border-bottom: 1px solid var(--line);
  }

  /* Rounded at the data end only, anchored flat on the baseline. */
  .bar {
    width: min(100%, 1.1rem);
    border-radius: 4px 4px 0 0;
    background: var(--accent, #8b7cf6);
  }

  .bar.empty {
    background: var(--fg-faint, rgba(245, 245, 247, 0.38));
  }

  .bar-label {
    color: var(--muted);
    font-size: 0.65rem;
  }

  .bar-label.is-today {
    color: var(--fg, #f5f5f7);
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress {
      transition: none;
    }
  }
</style>
