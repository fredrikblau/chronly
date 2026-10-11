<script lang="ts">
  import { SOUND_PRESETS } from '../lib/core/audio'
  import { createCountdown, extendCountdown, pauseRecord, resumeRecord } from '../lib/core/scheduler'
  import type { CountdownRecord } from '../lib/core/types'
  import { formatAlarmClock } from '../lib/ui/alarmTime'
  import { formatCountdown, spokenCountdown } from '../lib/ui/format'
  import { createNowStore } from '../lib/ui/now'
  import { recordActions, records } from '../lib/ui/records'
  import { settings } from '../lib/ui/settings'
  import { offerUndo } from '../lib/ui/toast'
  import Icon from './Icon.svelte'
  import SoundPicker from './SoundPicker.svelte'

  const now = createNowStore()

  const QUICK_PRESET_MINUTES = [1, 3, 5, 10, 15, 25]
  const EXTEND_MS = 60_000

  let label = $state('')
  let hours = $state(0)
  let minutes = $state(5)
  let seconds = $state(0)
  let soundId = $state(SOUND_PRESETS[0].id)
  let volume = $state(0.8)
  let error = $state<string | null>(null)
  let saving = $state(false)

  // Sort so what needs attention is at the top: running (soonest first), then
  // paused, then the spent ones waiting to be dismissed.
  const STATUS_RANK = { running: 0, paused: 1, completed: 2 }

  const countdowns = $derived(
    $records
      .filter((record): record is CountdownRecord => record.kind === 'countdown')
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.targetTimestamp - b.targetTimestamp),
  )

  /** A cleared number input binds through as null or NaN; read that as zero. */
  const whole = (value: number) => (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0)

  const durationMs = $derived((whole(hours) * 3600 + whole(minutes) * 60 + whole(seconds)) * 1000)

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

  function progressPercent(record: CountdownRecord, at: number): number {
    if (record.durationMs <= 0) return 100
    const elapsed = record.durationMs - remainingMs(record, at)
    return Math.min(100, Math.max(0, (elapsed / record.durationMs) * 100))
  }

  function applyPreset(presetMinutes: number) {
    hours = Math.floor(presetMinutes / 60)
    minutes = presetMinutes % 60
    seconds = 0
  }

  const activePreset = $derived(
    whole(seconds) === 0 ? QUICK_PRESET_MINUTES.find((m) => m === whole(hours) * 60 + whole(minutes)) : undefined,
  )

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
    if (durationMs <= 0) return
    if (
      !(await save(
        () =>
          recordActions.upsert(createCountdown(label.trim() || 'Timer', durationMs, Date.now(), { soundId, volume })),
        'Could not start that timer. Try again.',
      ))
    )
      return
    label = ''
  }

  async function restart(record: CountdownRecord) {
    const restarted = {
      ...createCountdown(record.label, record.durationMs, Date.now(), {
        soundId: record.soundId,
        volume: record.volume,
      }),
      id: record.id,
      createdAt: record.createdAt,
    }
    await save(() => recordActions.upsert(restarted), 'Could not restart that timer. Try again.')
  }

  async function extend(record: CountdownRecord) {
    await save(
      () => recordActions.upsert(extendCountdown(record, EXTEND_MS, Date.now())),
      'Could not add time to that timer. Try again.',
    )
  }

  async function togglePause(record: CountdownRecord) {
    const updated = record.status === 'running' ? pauseRecord(record, Date.now()) : resumeRecord(record, Date.now())
    await save(() => recordActions.upsert(updated), 'Could not update that timer. Try again.')
  }

  async function remove(record: CountdownRecord) {
    if (await save(() => recordActions.remove(record.id), 'Could not delete that timer. Try again.')) {
      offerUndo(`Deleted “${record.label}”`, () => recordActions.upsert(record))
    }
  }
</script>

<section class="panel" aria-labelledby="countdown-heading">
  <header class="panel-head">
    <h2 id="countdown-heading">Timers</h2>
    {#if countdowns.length}
      <span class="panel-meta">{countdowns.filter((c) => c.status === 'running').length} running</span>
    {/if}
  </header>

  {#if countdowns.length === 0}
    <div class="empty-state">
      <Icon name="timer" size={22} />
      <strong>No timers running</strong>
      <span>Set one below. Run as many as you like at once.</span>
    </div>
  {:else}
    <ul class="timers">
      {#each countdowns as countdown (countdown.id)}
        {@const remaining = remainingMs(countdown, $now)}
        <li
          class="timer card"
          class:is-done={countdown.status === 'completed'}
          class:is-paused={countdown.status === 'paused'}
        >
          <div class="timer-main">
            <div class="timer-head">
              <span class="timer-label" title={countdown.label}>{countdown.label}</span>
              {#if countdown.status === 'paused'}
                <span class="chip">Paused</span>
              {:else if countdown.status === 'running'}
                <span class="timer-ends">Ends {formatAlarmClock(countdown.targetTimestamp, $settings.hour12)}</span>
              {/if}
            </div>
            <span
              class="timer-remaining"
              class:is-urgent={countdown.status === 'running' && remaining <= 10_000}
              role="timer"
              aria-live="off"
              aria-label={countdown.status === 'completed'
                ? `${countdown.label} done`
                : `${countdown.label}, ${spokenCountdown(remaining)}`}
            >
              {countdown.status === 'completed' ? 'Done' : formatCountdown(remaining)}
            </span>
          </div>

          <div class="progress" aria-hidden="true">
            <div class="progress-fill" style:width={`${progressPercent(countdown, $now)}%`}></div>
          </div>

          <div class="timer-actions">
            {#if countdown.status === 'running'}
              <button
                type="button"
                class="btn btn-sm"
                aria-label={`Pause ${countdown.label}`}
                disabled={saving}
                onclick={() => void togglePause(countdown)}
              >
                <Icon name="pause" size={13} /> Pause
              </button>
            {:else if countdown.status === 'paused'}
              <button
                type="button"
                class="btn btn-sm btn-outline"
                aria-label={`Resume ${countdown.label}`}
                disabled={saving}
                onclick={() => void togglePause(countdown)}
              >
                <Icon name="play" size={11} /> Resume
              </button>
            {:else}
              <button
                type="button"
                class="btn btn-sm btn-outline"
                aria-label={`Restart ${countdown.label}`}
                disabled={saving}
                onclick={() => void restart(countdown)}
              >
                <Icon name="restart" size={13} /> Restart
              </button>
            {/if}
            <button
              type="button"
              class="btn btn-sm"
              aria-label={`Add 1 minute to ${countdown.label}`}
              disabled={saving}
              onclick={() => void extend(countdown)}
            >
              +1 min
            </button>
            <button
              type="button"
              class="icon-btn danger"
              title="Delete"
              aria-label={`Delete ${countdown.label}`}
              disabled={saving}
              onclick={() => void remove(countdown)}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    class="new-timer card"
    aria-labelledby="timer-form-title"
    onsubmit={(event) => {
      event.preventDefault()
      void start()
    }}
  >
    <h3 id="timer-form-title" class="section-title">New timer</h3>

    <div class="duration" role="group" aria-label="Duration">
      <label class="unit">
        <input class="input" type="number" min="0" max="23" aria-label="Hours" bind:value={hours} />
        <span>hr</span>
      </label>
      <label class="unit">
        <input class="input" type="number" min="0" max="999" aria-label="Minutes" bind:value={minutes} />
        <span>min</span>
      </label>
      <label class="unit">
        <input class="input" type="number" min="0" max="59" aria-label="Seconds" bind:value={seconds} />
        <span>sec</span>
      </label>
    </div>

    <div class="presets" role="group" aria-label="Quick durations">
      {#each QUICK_PRESET_MINUTES as presetMinutes (presetMinutes)}
        <button
          type="button"
          class="preset"
          class:is-active={activePreset === presetMinutes}
          aria-pressed={activePreset === presetMinutes}
          aria-label={`${presetMinutes} minutes`}
          onclick={() => applyPreset(presetMinutes)}
        >
          {presetMinutes}m
        </button>
      {/each}
    </div>

    <input
      class="input label-input"
      type="text"
      placeholder="Label"
      aria-label="Timer label"
      maxlength="80"
      disabled={saving}
      bind:value={label}
    />

    <div class="field">
      <span class="field-label">Sound</span>
      <SoundPicker bind:soundId bind:volume />
    </div>

    <button type="submit" class="btn btn-primary btn-block" disabled={durationMs <= 0 || saving}>
      {saving ? 'Saving…' : 'Start'}
    </button>
  </form>

  {#if error}<p class="error-text" role="alert">{error}</p>{/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    color: var(--fg, #f5f5f7);
  }

  .timers {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .timer {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.7rem 0.75rem 0.6rem;
  }

  .timer.is-done {
    border-color: color-mix(in srgb, var(--success, #6ee7b7) 55%, transparent);
  }

  .timer-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .timer-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .timer-ends {
    color: var(--fg-muted);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .timer-label {
    overflow: hidden;
    font-size: 0.9rem;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timer-remaining {
    font-size: 2rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    line-height: 1;
  }

  .is-paused .timer-remaining {
    color: var(--fg-muted);
  }

  .is-done .timer-remaining {
    color: var(--success, #6ee7b7);
    font-size: 1.5rem;
    font-weight: 500;
  }

  .timer-remaining.is-urgent {
    color: var(--warn, #f0c674);
  }

  .progress {
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--tint-strong);
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent, #8b7cf6);
    transition: width 250ms linear;
  }

  .is-done .progress-fill {
    background: var(--success, #6ee7b7);
  }

  .is-paused .progress-fill {
    background: var(--fg-faint);
  }

  .timer-actions {
    display: flex;
    gap: 0.3rem;
  }

  .timer-actions .icon-btn {
    margin-left: auto;
    width: 1.8rem;
    height: 1.8rem;
  }

  .new-timer {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.85rem;
  }

  .duration {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
  }

  .unit {
    position: relative;
    display: block;
  }

  .unit input {
    width: 100%;
    padding-right: 2.2rem;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .unit span {
    position: absolute;
    top: 50%;
    right: 0.6rem;
    color: var(--fg-muted);
    font-size: 0.7rem;
    pointer-events: none;
    transform: translateY(-50%);
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.3rem;
  }

  .preset {
    min-height: 1.9rem;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    background: transparent;
    color: var(--fg-muted);
    font: inherit;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease,
      border-color 120ms ease;
  }

  .preset:hover {
    border-color: var(--accent, #8b7cf6);
    color: var(--fg);
  }

  .preset.is-active {
    border-color: var(--accent, #8b7cf6);
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-weight: 650;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  /* The unit label sits where the spinner would; arrow keys still step. */
  .unit input {
    appearance: textfield;
  }

  .unit input::-webkit-inner-spin-button,
  .unit input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }
</style>
