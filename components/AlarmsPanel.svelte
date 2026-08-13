<script lang="ts">
  import { playAlarmSound, SOUND_PRESETS } from '../lib/core/audio'
  import { buildNotificationSpec, showNotification } from '../lib/core/notifications'
  import { createAlarm, effectiveDueTime } from '../lib/core/scheduler'
  import type { AlarmRecord } from '../lib/core/types'
  import {
    DAY_LABELS,
    DAY_NAMES,
    describeRecurrence,
    describeTimeUntil,
    formatAlarmClock,
    nextOccurrence,
  } from '../lib/ui/alarmTime'
  import { downloadIcs, openGoogleCalendarLink } from '../lib/ui/calendarAction'
  import { createNowStore } from '../lib/ui/now'
  import { records, recordActions } from '../lib/ui/records'
  import { settings } from '../lib/ui/settings'

  // Only the relative "rings in ..." captions depend on this, and they are
  // minute-grained — a fast tick would be pure re-render cost.
  const now = createNowStore(15_000)

  let label = $state('')
  let time = $state('07:00')
  let selectedDays = $state<number[]>([])
  let soundId = $state(SOUND_PRESETS[0].id)
  let volume = $state(0.8)

  const alarms = $derived(
    ($records ?? [])
      .filter((r): r is AlarmRecord => r.kind === 'alarm')
      .sort((a, b) => effectiveDueTime(a) - effectiveDueTime(b)),
  )

  const parsedTime = $derived.by(() => {
    const [hourStr, minuteStr] = time.split(':')
    const hour = Number(hourStr)
    const minute = Number(minuteStr)
    return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null
  })

  const sortedDays = $derived([...selectedDays].sort((a, b) => a - b))

  const previewCaption = $derived.by(() => {
    if (!parsedTime) return 'Enter a time'
    const target = nextOccurrence(parsedTime.hour, parsedTime.minute, $now, sortedDays)
    return `Rings ${describeTimeUntil(target, $now)}`
  })

  function toggleDay(day: number) {
    selectedDays = selectedDays.includes(day) ? selectedDays.filter((d) => d !== day) : [...selectedDays, day]
  }

  function buildDraft(targetTimestamp: number, at: number): AlarmRecord {
    return createAlarm(label.trim() || 'Alarm', targetTimestamp, at, sortedDays.length ? { days: sortedDays } : null, {
      soundId,
      volume,
    })
  }

  function addAlarm() {
    if (!parsedTime) return
    const at = Date.now()
    const target = nextOccurrence(parsedTime.hour, parsedTime.minute, at, sortedDays)
    void recordActions.upsert(buildDraft(target, at))
    // Sound and volume stay put: they read as preferences, not per-alarm input.
    label = ''
    selectedDays = []
  }

  /** Fires the notification and the sound exactly as the background worker
   *  would, so the user can confirm both halves work before trusting an alarm
   *  to wake them. The preview record is never stored. */
  function testAlarm() {
    const at = Date.now()
    void showNotification(buildNotificationSpec(buildDraft(at, at)))
    void playAlarmSound(soundId, volume)
  }

  /** A ring is an instant, but a calendar entry needs width — this is the block
   *  the event occupies, long enough to read on a day view. */
  const CALENDAR_EVENT_MS = 5 * 60_000

  /** A snooze supersedes the stored target, so the calendar entry follows the
   *  same due time the row is counting down to. */
  function calendarEventFor(alarm: AlarmRecord) {
    const start = new Date(effectiveDueTime(alarm))
    return {
      title: alarm.label,
      start,
      end: new Date(start.getTime() + CALENDAR_EVENT_MS),
      description: `Chronly alarm (${describeRecurrence(alarm.recurrence)})`,
    }
  }

  function addToGoogleCalendar(alarm: AlarmRecord) {
    const { title, start, end, description } = calendarEventFor(alarm)
    openGoogleCalendarLink(title, start, end, description)
  }

  function saveIcs(alarm: AlarmRecord) {
    const { title, start, end, description } = calendarEventFor(alarm)
    downloadIcs(title, start, end, description)
  }

  function statusFor(alarm: AlarmRecord): string {
    if (alarm.notified && !alarm.recurrence) return 'Rang'
    return describeTimeUntil(effectiveDueTime(alarm), $now)
  }
</script>

<section class="alarms" aria-labelledby="alarms-heading">
  <header class="head">
    <h2 id="alarms-heading">Alarms</h2>
    {#if alarms.length > 0}
      <span class="count">{alarms.length} set</span>
    {/if}
  </header>

  {#if alarms.length === 0}
    <p class="empty">No alarms yet — set your first one below.</p>
  {:else}
    <ul class="list">
      {#each alarms as alarm (alarm.id)}
        <li class="alarm" class:snoozed={alarm.snoozedUntil !== null}>
          <span class="clock">{formatAlarmClock(alarm.targetTimestamp, $settings.hour12)}</span>
          <div class="detail">
            <div class="titleRow">
              <span class="label">{alarm.label}</span>
              {#if alarm.snoozedUntil !== null}
                <span class="badge">Snoozed</span>
              {/if}
            </div>
            <div class="metaRow">
              <span class="repeat">{describeRecurrence(alarm.recurrence)}</span>
              <span class="dot" aria-hidden="true">·</span>
              <span class="until">{statusFor(alarm)}</span>
            </div>
          </div>
          <div class="rowActions">
            <button
              type="button"
              class="calBtn"
              title={`Add alarm ${alarm.label} to Google Calendar`}
              aria-label={`Add alarm ${alarm.label} to Google Calendar`}
              onclick={() => addToGoogleCalendar(alarm)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="2" />
                <path d="M2.2 6.6h11.6M5.6 2v2.6M10.4 2v2.6" stroke-linecap="round" />
              </svg>
            </button>
            <button
              type="button"
              class="calBtn"
              title={`Download the .ics calendar file for alarm ${alarm.label}`}
              aria-label={`Download the .ics calendar file for alarm ${alarm.label}`}
              onclick={() => saveIcs(alarm)}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M8 2.4v7.2M5.1 6.9 8 9.8l2.9-2.9M3.2 13.2h9.6" />
              </svg>
            </button>
            <button
              type="button"
              class="delete"
              aria-label={`Delete alarm ${alarm.label}`}
              onclick={() => void recordActions.remove(alarm.id)}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    class="new"
    onsubmit={(event) => {
      event.preventDefault()
      addAlarm()
    }}
  >
    <h3 class="formTitle">New alarm</h3>

    <div class="topRow">
      <label class="sr-only" for="alarm-time">Time</label>
      <input id="alarm-time" class="time" type="time" bind:value={time} required />
      <label class="sr-only" for="alarm-label">Label</label>
      <input id="alarm-label" class="text" type="text" placeholder="Label" bind:value={label} />
    </div>

    <fieldset class="days">
      <legend>Repeat</legend>
      <div class="dayRow">
        {#each DAY_LABELS as dayLabel, day (day)}
          <button
            type="button"
            class="day"
            class:on={selectedDays.includes(day)}
            aria-pressed={selectedDays.includes(day)}
            aria-label={DAY_NAMES[day]}
            onclick={() => toggleDay(day)}
          >
            {dayLabel}
          </button>
        {/each}
      </div>
    </fieldset>

    <div class="field">
      <label for="alarm-sound">Sound</label>
      <select id="alarm-sound" bind:value={soundId}>
        {#each SOUND_PRESETS as preset (preset.id)}
          <option value={preset.id}>{preset.label}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="alarm-volume">Volume</label>
      <div class="slider">
        <input
          id="alarm-volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={volume}
          aria-valuetext={`${Math.round(volume * 100)} percent`}
        />
        <span class="percent">{Math.round(volume * 100)}%</span>
      </div>
    </div>

    <p class="preview" aria-live="polite">{previewCaption}</p>

    <div class="actions">
      <button type="button" class="ghost" onclick={testAlarm}>Test</button>
      <button type="submit" class="primary">Add alarm</button>
    </div>
  </form>
</section>

<style>
  .alarms {
    --accent: #8b7cf6;
    --surface: rgba(255, 255, 255, 0.045);
    --surface-strong: rgba(255, 255, 255, 0.08);
    --line: rgba(255, 255, 255, 0.09);
    --muted: #a5a5b0;

    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    width: 100%;
    color: inherit;
    text-align: left;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .count {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .empty {
    margin: 0;
    padding: 1.25rem 1rem;
    border: 1px dashed var(--line);
    border-radius: 0.75rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .alarm {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .alarm:hover {
    border-color: var(--surface-strong);
    background: var(--surface-strong);
  }

  .alarm.snoozed .clock {
    color: var(--muted);
  }

  .clock {
    font-size: 1.5rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .titleRow,
  .metaRow {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .label {
    overflow: hidden;
    font-size: 0.9rem;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 30%, transparent);
    font-size: 0.65rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .metaRow {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .rowActions {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }

  .calBtn {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: none;
    color: var(--muted);
    cursor: pointer;
    transition:
      color 120ms ease,
      background 120ms ease;
  }

  .calBtn svg {
    width: 0.85rem;
    height: 0.85rem;
  }

  .calBtn:hover,
  .calBtn:focus-visible {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: #f5f5f7;
  }

  .delete {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: none;
    color: var(--muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      color 120ms ease,
      background 120ms ease;
  }

  .delete:hover,
  .delete:focus-visible {
    background: rgba(248, 113, 113, 0.15);
    color: #fca5a5;
  }

  .new {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
    border: 1px solid var(--line);
    border-radius: 0.875rem;
    background: var(--surface);
  }

  .formTitle {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--muted);
    text-transform: uppercase;
  }

  .topRow {
    display: flex;
    gap: 0.5rem;
  }

  input,
  select {
    min-width: 0;
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
  }

  input.time {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }

  input.text {
    flex: 1 1 auto;
  }

  input:focus-visible,
  select:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .days {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0 0 0.3rem;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--muted);
    text-transform: uppercase;
  }

  .dayRow {
    display: flex;
    gap: 0.25rem;
  }

  .day {
    flex: 1 1 0;
    padding: 0.3rem 0;
    border: 1px solid var(--line);
    border-radius: 0.45rem;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease,
      border-color 120ms ease;
  }

  .day:hover {
    border-color: var(--accent);
    color: #f5f5f7;
  }

  .day.on {
    border-color: transparent;
    background: var(--accent);
    color: #14121f;
    font-weight: 600;
  }

  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .field select {
    flex: 1 1 auto;
    max-width: 60%;
    color: #f5f5f7;
  }

  .slider {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    max-width: 60%;
  }

  input[type='range'] {
    flex: 1 1 auto;
    padding: 0;
    border: 0;
    background: transparent;
    accent-color: var(--accent);
  }

  .percent {
    min-width: 2.5rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .preview {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .actions button {
    padding: 0.45rem 0.75rem;
    border-radius: 0.55rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .ghost {
    border: 1px solid var(--line);
    background: transparent;
    color: inherit;
  }

  .ghost:hover {
    border-color: var(--accent);
  }

  .primary {
    flex: 1 1 auto;
    border: 1px solid transparent;
    background: var(--accent);
    color: #14121f;
    font-weight: 600;
  }

  .primary:hover {
    background: color-mix(in srgb, var(--accent) 85%, #ffffff);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .alarm,
    .day,
    .calBtn,
    .delete,
    .actions button {
      transition: none;
    }
  }
</style>
