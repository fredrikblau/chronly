<script lang="ts">
  import { SOUND_PRESETS } from '../lib/core/audio'
  import { createCountdown, pauseRecord, resumeRecord } from '../lib/core/scheduler'
  import type { CountdownRecord } from '../lib/core/types'
  import { createNowStore } from '../lib/ui/now'
  import { recordActions, records } from '../lib/ui/records'
  import SoundPicker from './SoundPicker.svelte'

  const now = createNowStore()

  const QUICK_PRESET_MINUTES = [1, 3, 5, 10, 25]

  let label = $state('')
  let minutes = $state(5)
  let seconds = $state(0)
  let soundId = $state(SOUND_PRESETS[0].id)
  let volume = $state(0.8)

  // Sort so what needs attention is at the top: running (soonest first), then
  // paused, then the spent ones waiting to be dismissed.
  const STATUS_RANK = { running: 0, paused: 1, completed: 2 }

  const countdowns = $derived(
    $records
      .filter((record): record is CountdownRecord => record.kind === 'countdown')
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.targetTimestamp - b.targetTimestamp),
  )

  const durationMs = $derived((Number(minutes) * 60 + Number(seconds)) * 1000)

  function pad(value: number): string {
    return String(value).padStart(2, '0')
  }

  /**
   * Remaining time is always re-derived from the stored absolute target (or the
   * remainder banked at the pause), never counted down in memory — the popup is
   * thrown away on every close and the background worker can be evicted at any
   * moment.
   */
  function remainingMs(record: CountdownRecord, at: number): number {
    if (record.status === 'completed') return 0
    if (record.status === 'paused') return Math.max(0, record.remainingMsAtPause ?? 0)
    return Math.max(0, record.targetTimestamp - at)
  }

  function formatRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`
  }

  function progressPercent(record: CountdownRecord, at: number): number {
    if (record.durationMs <= 0) return 100
    const elapsed = record.durationMs - remainingMs(record, at)
    return Math.min(100, Math.max(0, (elapsed / record.durationMs) * 100))
  }

  function applyPreset(presetMinutes: number) {
    minutes = presetMinutes
    seconds = 0
  }

  function start() {
    if (durationMs <= 0) return
    void recordActions.upsert(createCountdown(label.trim() || 'Timer', durationMs, Date.now(), { soundId, volume }))
    label = ''
  }

  function restart(record: CountdownRecord) {
    void recordActions.upsert(
      createCountdown(record.label, record.durationMs, Date.now(), {
        soundId: record.soundId,
        volume: record.volume,
      }),
    )
    void recordActions.remove(record.id)
  }
</script>

<section class="panel" aria-labelledby="countdown-heading">
  <h2 id="countdown-heading">Timers</h2>

  {#if countdowns.length === 0}
    <p class="empty">No timers running. Set one below.</p>
  {:else}
    <ul class="timers">
      {#each countdowns as countdown (countdown.id)}
        {@const remaining = remainingMs(countdown, $now)}
        <li class="timer" class:is-done={countdown.status === 'completed'}>
          <div class="timer-head">
            <span class="timer-label">{countdown.label}</span>
            {#if countdown.status === 'paused'}
              <span class="chip">Paused</span>
            {/if}
          </div>

          <span class="timer-remaining" class:is-urgent={countdown.status === 'running' && remaining <= 10_000}>
            {countdown.status === 'completed' ? 'Done' : formatRemaining(remaining)}
          </span>

          <div class="timer-actions">
            {#if countdown.status === 'running'}
              <button
                type="button"
                class="ghost"
                aria-label={`Pause ${countdown.label}`}
                onclick={() => recordActions.upsert(pauseRecord(countdown, Date.now()))}
              >
                Pause
              </button>
            {:else if countdown.status === 'paused'}
              <button
                type="button"
                class="ghost"
                aria-label={`Resume ${countdown.label}`}
                onclick={() => recordActions.upsert(resumeRecord(countdown, Date.now()))}
              >
                Resume
              </button>
            {:else}
              <button
                type="button"
                class="ghost"
                aria-label={`Restart ${countdown.label}`}
                onclick={() => restart(countdown)}
              >
                Restart
              </button>
            {/if}
            <button
              type="button"
              class="ghost danger"
              aria-label={`Delete ${countdown.label}`}
              onclick={() => recordActions.remove(countdown.id)}
            >
              Delete
            </button>
          </div>

          <div class="progress" aria-hidden="true">
            <div class="progress-fill" style:width={`${progressPercent(countdown, $now)}%`}></div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    class="new-timer"
    onsubmit={(event) => {
      event.preventDefault()
      start()
    }}
  >
    <input class="label-input" type="text" placeholder="Label" aria-label="Timer label" bind:value={label} />

    <div class="duration">
      <input type="number" min="0" max="999" aria-label="Minutes" bind:value={minutes} />
      <span class="colon" aria-hidden="true">:</span>
      <input type="number" min="0" max="59" aria-label="Seconds" bind:value={seconds} />
    </div>

    <div class="presets" role="group" aria-label="Quick durations">
      {#each QUICK_PRESET_MINUTES as presetMinutes (presetMinutes)}
        <button
          type="button"
          class="preset"
          class:is-active={minutes === presetMinutes && seconds === 0}
          aria-label={`${presetMinutes} minutes`}
          onclick={() => applyPreset(presetMinutes)}
        >
          {presetMinutes}m
        </button>
      {/each}
    </div>

    <SoundPicker bind:soundId bind:volume />

    <button type="submit" class="primary" disabled={durationMs <= 0}>Start</button>
  </form>
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

  .empty {
    margin: 0;
    padding: 0.9rem 0.75rem;
    border: 1px dashed var(--line);
    border-radius: 0.75rem;
    font-size: 0.8125rem;
    color: var(--muted);
    text-align: center;
  }

  .timers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .timer {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'head remaining' 'actions remaining';
    align-items: center;
    gap: 0.15rem 0.5rem;
    padding: 0.6rem 0.75rem 0.7rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .timer.is-done {
    border-color: color-mix(in srgb, var(--accent, #8b7cf6) 50%, transparent);
  }

  .timer-head {
    grid-area: head;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .timer-label {
    font-size: 0.9375rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip {
    flex: none;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--tint-strong, rgba(255, 255, 255, 0.08));
    font-size: 0.625rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .timer-remaining {
    grid-area: remaining;
    font-size: 1.375rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }

  .timer-remaining.is-urgent {
    color: var(--accent-ink, #8b7cf6);
  }

  .timer-actions {
    grid-area: actions;
    display: flex;
    gap: 0.35rem;
  }

  .progress {
    position: absolute;
    inset: auto 0 0 0;
    height: 2px;
    background: var(--tint-strong, rgba(255, 255, 255, 0.08));
  }

  .progress-fill {
    height: 100%;
    background: var(--accent, #8b7cf6);
    transition: width 0.25s linear;
  }

  .new-timer {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  /* Grid items default to min-width:auto, so the text input's intrinsic width
     keeps the 1fr column from shrinking and the whole form overflows the card
     at popup width. */
  .new-timer > * {
    min-width: 0;
  }

  .label-input {
    width: 100%;
  }

  .presets {
    grid-column: 1 / -1;
  }

  .presets {
    grid-column: 1 / -1;
    display: flex;
    gap: 0.35rem;
  }

  input {
    padding: 0.4rem 0.5rem;
    background: var(--field, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    color: inherit;
    font: inherit;
    font-size: 0.8125rem;
  }

  .duration {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .duration input {
    width: 3.25rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .colon {
    color: var(--muted);
  }

  button {
    padding: 0.4rem 0.7rem;
    border-radius: 0.5rem;
    border: 1px solid transparent;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .primary {
    grid-column: 1 / -1;
    background: var(--accent, #8b7cf6);
    color: var(--on-accent, #0b0b0f);
    font-weight: 600;
  }

  .primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent, #8b7cf6) 85%, #ffffff);
  }

  .primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ghost {
    background: var(--tint, rgba(255, 255, 255, 0.06));
    border-color: var(--line);
    color: var(--muted);
  }

  .ghost:hover {
    background: var(--tint-strong, rgba(255, 255, 255, 0.12));
    color: var(--fg, #f5f5f7);
  }

  .ghost.danger:hover {
    background: var(--danger-tint, rgba(248, 113, 113, 0.16));
    border-color: color-mix(in srgb, var(--danger, #fca5a5) 45%, transparent);
    color: var(--danger, #fca5a5);
  }

  .preset {
    background: transparent;
    border-color: var(--line);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .preset:hover {
    color: var(--fg, #f5f5f7);
  }

  .preset.is-active {
    border-color: var(--accent, #8b7cf6);
    color: var(--accent-ink, #8b7cf6);
  }

  :is(button, input):focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill,
    button {
      transition: none;
    }
  }
</style>
