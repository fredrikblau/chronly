<script lang="ts">
  import { createCountdown, effectiveDueTime, isAlarmArmed } from '../lib/core/scheduler'
  import { computeElapsedMs } from '../lib/core/stopwatch'
  import { formatTimeInZone, getRelativeDiffLabel } from '../lib/core/time'
  import type { AlarmRecord, CountdownRecord, PomodoroRecord } from '../lib/core/types'
  import { describeRecurrence, describeTimeUntil, formatAlarmClock } from '../lib/ui/alarmTime'
  import { formatCountdown, formatStopwatch } from '../lib/ui/format'
  import { recordActions, records } from '../lib/ui/records'
  import { settings } from '../lib/ui/settings'
  import { stopwatchSummary } from '../lib/ui/stopwatch'
  import { worldClocks } from '../lib/ui/worldClocks'
  import ClockFace from './ClockFace.svelte'
  import Icon from './Icon.svelte'

  type Destination = 'alarms' | 'timers' | 'stopwatch' | 'world' | 'focus'

  interface Props {
    now: number
    onNavigate?: (tab: Destination) => void
  }

  const { now, onNavigate = () => undefined }: Props = $props()

  const QUICK_MINUTES = [1, 5, 10, 15, 25]
  const PHASE_LABELS: Record<PomodoroRecord['phase'], string> = {
    focus: 'Focus',
    shortBreak: 'Short break',
    longBreak: 'Long break',
  }
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  let starting = $state(false)
  let error = $state<string | null>(null)

  const longDate = $derived(
    new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now)),
  )

  const nextAlarm = $derived(
    $records
      .filter((r): r is AlarmRecord => r.kind === 'alarm' && isAlarmArmed(r))
      .sort((a, b) => effectiveDueTime(a) - effectiveDueTime(b))[0],
  )

  const STATUS_RANK = { running: 0, paused: 1, completed: 2 }
  const timers = $derived(
    $records
      .filter((r): r is CountdownRecord => r.kind === 'countdown')
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.targetTimestamp - b.targetTimestamp),
  )
  const focus = $derived($records.find((r): r is PomodoroRecord => r.kind === 'pomodoro'))
  const stopwatchActive = $derived($stopwatchSummary.status !== 'idle')
  const zones = $derived($worldClocks.slice(0, 4))
  const hasActivity = $derived(Boolean(nextAlarm || timers.length || focus || stopwatchActive))

  function remaining(record: CountdownRecord | PomodoroRecord): number {
    if (record.status === 'completed') return 0
    if (record.status === 'paused') return Math.max(0, record.remainingMsAtPause ?? 0)
    return Math.max(0, record.targetTimestamp - now)
  }

  function timerProgress(record: CountdownRecord): number {
    if (record.durationMs <= 0) return 1
    return Math.min(1, Math.max(0, 1 - remaining(record) / record.durationMs))
  }

  async function quickStart(minutes: number) {
    if (starting) return
    starting = true
    error = null
    try {
      await recordActions.upsert(createCountdown(`${minutes} min timer`, minutes * 60_000, Date.now()))
    } catch {
      error = 'Could not start that timer. Try again.'
    } finally {
      starting = false
    }
  }
</script>

<div class="overview">
  <div class="hero">
    <ClockFace
      {now}
      hour12={$settings.hour12}
      showSeconds={$settings.showSeconds}
      mode={$settings.clockMode}
      contrast={$settings.clockContrast}
    />
    <p class="date">{longDate}</p>
  </div>

  {#if hasActivity}
    <section class="block" aria-labelledby="overview-upnext">
      <h2 id="overview-upnext" class="section-title">Up next</h2>
      <ul class="items">
        {#if nextAlarm}
          <li>
            <button type="button" class="item card" onclick={() => onNavigate('alarms')}>
              <span class="item-icon"><Icon name="alarm" size={18} /></span>
              <span class="item-text">
                <span class="item-title">{nextAlarm.label}</span>
                <span class="item-meta">
                  {describeRecurrence(nextAlarm.recurrence)} · {describeTimeUntil(effectiveDueTime(nextAlarm), now)}
                </span>
              </span>
              <span class="item-value">{formatAlarmClock(effectiveDueTime(nextAlarm), $settings.hour12)}</span>
            </button>
          </li>
        {/if}
        {#each timers.slice(0, 3) as timer (timer.id)}
          <li>
            <button type="button" class="item card" onclick={() => onNavigate('timers')}>
              <span class="item-icon" class:done={timer.status === 'completed'}><Icon name="timer" size={18} /></span>
              <span class="item-text">
                <span class="item-title">{timer.label}</span>
                <span class="item-meta">
                  {timer.status === 'running' ? 'Running' : timer.status === 'paused' ? 'Paused' : 'Finished'}
                </span>
                <span class="bar" aria-hidden="true"><span style:width={`${timerProgress(timer) * 100}%`}></span></span>
              </span>
              <span class="item-value">{timer.status === 'completed' ? 'Done' : formatCountdown(remaining(timer))}</span
              >
            </button>
          </li>
        {/each}
        {#if timers.length > 3}
          <li class="more">
            <button type="button" class="btn btn-quiet btn-sm" onclick={() => onNavigate('timers')}>
              +{timers.length - 3} more timers
            </button>
          </li>
        {/if}
        {#if focus}
          <li>
            <button type="button" class="item card" onclick={() => onNavigate('focus')}>
              <span class="item-icon" data-phase={focus.phase}><Icon name="focus" size={18} /></span>
              <span class="item-text">
                <span class="item-title">{PHASE_LABELS[focus.phase]}</span>
                <span class="item-meta">{focus.label}{focus.status === 'paused' ? ' · Paused' : ''}</span>
              </span>
              <span class="item-value">{formatCountdown(remaining(focus))}</span>
            </button>
          </li>
        {/if}
        {#if stopwatchActive}
          <li>
            <button type="button" class="item card" onclick={() => onNavigate('stopwatch')}>
              <span class="item-icon"><Icon name="stopwatch" size={18} /></span>
              <span class="item-text">
                <span class="item-title">Stopwatch</span>
                <span class="item-meta">{$stopwatchSummary.status === 'running' ? 'Running' : 'Paused'}</span>
              </span>
              <span class="item-value">{formatStopwatch(computeElapsedMs($stopwatchSummary, now)).slice(0, -3)}</span>
            </button>
          </li>
        {/if}
      </ul>
    </section>
  {/if}

  <section class="block" aria-labelledby="overview-quick">
    <div class="panel-head">
      <h2 id="overview-quick" class="section-title">Quick timer</h2>
      <button type="button" class="btn btn-quiet btn-sm" onclick={() => onNavigate('timers')}>
        Custom <Icon name="right" size={12} />
      </button>
    </div>
    <div class="quick" role="group" aria-label="Start a quick timer">
      {#each QUICK_MINUTES as minutes (minutes)}
        <button
          type="button"
          class="btn"
          disabled={starting}
          aria-label={`Start a ${minutes} minute timer`}
          onclick={() => void quickStart(minutes)}
        >
          {minutes}m
        </button>
      {/each}
    </div>
    {#if error}<p class="error-text" role="alert">{error}</p>{/if}
  </section>

  {#if !hasActivity}
    <div class="shortcuts">
      <button type="button" class="btn" onclick={() => onNavigate('alarms')}><Icon name="alarm" /> Set an alarm</button>
      <button type="button" class="btn" onclick={() => onNavigate('focus')}><Icon name="focus" /> Start focusing</button
      >
    </div>
  {/if}

  <section class="block" aria-labelledby="overview-world">
    <div class="panel-head">
      <h2 id="overview-world" class="section-title">World</h2>
      <button type="button" class="btn btn-quiet btn-sm" onclick={() => onNavigate('world')}>
        {zones.length ? 'All' : 'Add a city'}
        <Icon name="right" size={12} />
      </button>
    </div>
    {#if zones.length}
      <ul class="zones">
        {#each zones as zone (zone.id)}
          <li class="zone card" style:--zone-color={zone.color}>
            <span class="zone-name">{zone.label}</span>
            <span class="zone-time">
              {formatTimeInZone(new Date(now), zone.timeZone, { hour12: $settings.hour12, showSeconds: false })}
            </span>
            <span class="zone-diff">{getRelativeDiffLabel(localZone, zone.timeZone, new Date(now))}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .overview {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.75rem 0 0.25rem;
  }

  .date {
    margin: 0;
    color: var(--fg-muted);
    font-size: 0.875rem;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.55rem 0.7rem;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease;
  }

  .item:hover {
    border-color: color-mix(in srgb, var(--accent, #8b7cf6) 55%, transparent);
    background: var(--tint-strong);
  }

  .item-icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .item-icon.done {
    background: var(--success-tint);
    color: var(--success);
  }

  .item-icon[data-phase='shortBreak'] {
    background: color-mix(in srgb, var(--phase-short) 18%, transparent);
    color: var(--phase-short);
  }

  .item-icon[data-phase='longBreak'] {
    background: color-mix(in srgb, var(--phase-long) 18%, transparent);
    color: var(--phase-long);
  }

  .item-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .item-title {
    overflow: hidden;
    font-size: 0.85rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta {
    overflow: hidden;
    color: var(--fg-muted);
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-value {
    font-size: 1.15rem;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    display: block;
    height: 3px;
    margin-top: 0.25rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--tint-strong);
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent, #8b7cf6);
  }

  .more {
    display: flex;
    justify-content: center;
  }

  .quick {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.35rem;
  }

  .quick .btn {
    font-variant-numeric: tabular-nums;
  }

  .shortcuts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }

  .zones {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .zone {
    display: grid;
    gap: 0.05rem;
    padding: 0.5rem 0.65rem 0.55rem;
    border-left: 3px solid var(--zone-color, var(--accent, #8b7cf6));
  }

  .zone-name {
    overflow: hidden;
    color: var(--fg-muted);
    font-size: 0.72rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .zone-time {
    font-size: 1.2rem;
    font-variant-numeric: tabular-nums;
  }

  .zone-diff {
    color: var(--fg-faint);
    font-size: 0.68rem;
  }
</style>
