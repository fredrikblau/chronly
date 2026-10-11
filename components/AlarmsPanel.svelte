<script lang="ts">
  import { tick } from 'svelte'
  import { playAlarmSound, SOUND_PRESETS } from '../lib/core/audio'
  import { buildNotificationSpec, showNotification } from '../lib/core/notifications'
  import {
    createAlarm,
    disableAlarm,
    editAlarm,
    effectiveDueTime,
    enableAlarm,
    isAlarmArmed,
  } from '../lib/core/scheduler'
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
  import Icon from './Icon.svelte'
  import SoundPicker from './SoundPicker.svelte'

  // Only the relative "rings in ..." captions depend on this, and they are
  // minute-grained — a fast tick would be pure re-render cost.
  const now = createNowStore(15_000)

  const DEFAULT_TIME = '07:00'
  const DAY_PRESETS = [
    { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
    { label: 'Weekends', days: [0, 6] },
    { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  ]

  let label = $state('')
  let time = $state(DEFAULT_TIME)
  let selectedDays = $state<number[]>([])
  let soundId = $state(SOUND_PRESETS[0].id)
  let volume = $state(0.8)
  let error = $state<string | null>(null)
  let saving = $state(false)
  /** The alarm being edited, or null while the form creates a new one. */
  let editingId = $state<string | null>(null)
  let timeInput = $state<HTMLInputElement>()

  const alarms = $derived(
    ($records ?? [])
      .filter((r): r is AlarmRecord => r.kind === 'alarm')
      .sort((a, b) => Number(isAlarmArmed(b)) - Number(isAlarmArmed(a)) || effectiveDueTime(a) - effectiveDueTime(b)),
  )
  const armedCount = $derived(alarms.filter(isAlarmArmed).length)
  const editing = $derived(alarms.find((alarm) => alarm.id === editingId))

  const parsedTime = $derived.by(() => {
    const [hourStr, minuteStr] = time.split(':')
    const hour = Number(hourStr)
    const minute = Number(minuteStr)
    return time && Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null
  })

  const sortedDays = $derived([...selectedDays].sort((a, b) => a - b))

  const previewCaption = $derived.by(() => {
    if (!parsedTime) return 'Enter a time'
    const target = nextOccurrence(parsedTime.hour, parsedTime.minute, $now, sortedDays)
    return `Rings ${describeTimeUntil(target, $now)} · ${describeRecurrence(sortedDays.length ? { days: sortedDays } : null)}`
  })

  function toggleDay(day: number) {
    selectedDays = selectedDays.includes(day) ? selectedDays.filter((d) => d !== day) : [...selectedDays, day]
  }

  function applyDayPreset(days: number[]) {
    const same = days.length === selectedDays.length && days.every((d) => selectedDays.includes(d))
    selectedDays = same ? [] : [...days]
  }

  function buildDraft(targetTimestamp: number, at: number): AlarmRecord {
    return createAlarm(label.trim() || 'Alarm', targetTimestamp, at, sortedDays.length ? { days: sortedDays } : null, {
      soundId,
      volume,
    })
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

  function resetForm() {
    editingId = null
    label = ''
    time = DEFAULT_TIME
    selectedDays = []
  }

  async function submit() {
    if (!parsedTime) return
    const at = Date.now()
    if (editing) {
      const updated = editAlarm(
        editing,
        {
          label: label.trim() || 'Alarm',
          hour: parsedTime.hour,
          minute: parsedTime.minute,
          days: sortedDays,
          soundId,
          volume,
        },
        at,
      )
      if (await save(() => recordActions.upsert(updated), 'Could not save that alarm. Try again.')) resetForm()
      return
    }
    const target = nextOccurrence(parsedTime.hour, parsedTime.minute, at, sortedDays)
    if (!(await save(() => recordActions.upsert(buildDraft(target, at)), 'Could not save that alarm. Try again.')))
      return
    // Sound and volume stay put: they read as preferences, not per-alarm input.
    label = ''
    selectedDays = []
  }

  async function startEditing(alarm: AlarmRecord) {
    const at = new Date(alarm.targetTimestamp)
    editingId = alarm.id
    label = alarm.label
    time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    selectedDays = [...(alarm.recurrence?.days ?? [])]
    soundId = alarm.soundId
    volume = alarm.volume
    error = null
    await tick()
    timeInput?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    timeInput?.focus()
  }

  async function setArmed(alarm: AlarmRecord, armed: boolean) {
    const at = Date.now()
    await save(
      () => recordActions.upsert(armed ? enableAlarm(alarm, at) : disableAlarm(alarm, at)),
      `Could not turn ${armed ? 'on' : 'off'} that alarm. Try again.`,
    )
  }

  async function removeAlarm(id: string) {
    if (await save(() => recordActions.remove(id), 'Could not delete that alarm. Try again.')) {
      if (editingId === id) resetForm()
    }
  }

  /** Fires the notification and the sound exactly as the background worker
   *  would, so the user can confirm both halves work before trusting an alarm
   *  to wake them. The preview record is never stored. */
  function testAlarm() {
    const at = Date.now()
    error = null
    void Promise.all([
      showNotification(buildNotificationSpec(buildDraft(at, at))),
      playAlarmSound(soundId, volume, 'preview', false),
    ]).catch(() => {
      error = 'Could not show the alarm preview. Check notification and audio access, then try again.'
    })
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
    if (!isAlarmArmed(alarm)) return alarm.notified && !alarm.recurrence ? 'Rang · off' : 'Off'
    return describeTimeUntil(effectiveDueTime(alarm), $now)
  }
</script>

<section class="alarms" aria-labelledby="alarms-heading">
  <header class="panel-head">
    <h2 id="alarms-heading">Alarms</h2>
    {#if alarms.length > 0}
      <span class="panel-meta">{armedCount} of {alarms.length} on</span>
    {/if}
  </header>

  {#if alarms.length === 0}
    <div class="empty-state">
      <Icon name="alarm" size={22} />
      <strong>No alarms yet</strong>
      <span>Set your first one below. It rings even when this popup is closed.</span>
    </div>
  {:else}
    <ul class="list">
      {#each alarms as alarm (alarm.id)}
        {@const armed = isAlarmArmed(alarm)}
        <li class="alarm card" class:off={!armed} class:editing={alarm.id === editingId}>
          <div class="top">
            <span class="clock">{formatAlarmClock(effectiveDueTime(alarm), $settings.hour12)}</span>
            {#if alarm.snoozedUntil !== null && alarm.snoozedUntil !== undefined && armed}
              <span class="chip accent">Snoozed</span>
            {/if}
            <input
              type="checkbox"
              role="switch"
              class="switch"
              aria-label={`${alarm.label} alarm`}
              checked={armed}
              disabled={saving}
              onchange={(event) => void setArmed(alarm, event.currentTarget.checked)}
            />
          </div>
          <div class="bottom">
            <div class="detail">
              <span class="label">{alarm.label}</span>
              <span class="meta">
                <span class="repeat">{describeRecurrence(alarm.recurrence)}</span>
                <span aria-hidden="true">·</span>
                <span class="until">{statusFor(alarm)}</span>
              </span>
            </div>
            <div class="rowActions">
              <button
                type="button"
                class="icon-btn"
                title="Edit"
                aria-label={`Edit alarm ${alarm.label}`}
                onclick={() => void startEditing(alarm)}
              >
                <Icon name="edit" size={15} />
              </button>
              <button
                type="button"
                class="icon-btn"
                title="Add to Google Calendar"
                aria-label={`Add alarm ${alarm.label} to Google Calendar`}
                onclick={() => addToGoogleCalendar(alarm)}
              >
                <Icon name="calendar" size={15} />
              </button>
              <button
                type="button"
                class="icon-btn"
                title="Download .ics"
                aria-label={`Download the .ics calendar file for alarm ${alarm.label}`}
                onclick={() => saveIcs(alarm)}
              >
                <Icon name="download" size={15} />
              </button>
              <button
                type="button"
                class="icon-btn danger"
                title="Delete"
                aria-label={`Delete alarm ${alarm.label}`}
                disabled={saving}
                onclick={() => void removeAlarm(alarm.id)}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    class="new card"
    class:is-editing={editing}
    aria-labelledby="alarm-form-title"
    onsubmit={(event) => {
      event.preventDefault()
      void submit()
    }}
  >
    <div class="formHead">
      <h3 id="alarm-form-title" class="section-title">{editing ? `Edit “${editing.label}”` : 'New alarm'}</h3>
      {#if editing}
        <button type="button" class="btn btn-quiet btn-sm" onclick={resetForm}>Cancel</button>
      {/if}
    </div>

    <div class="topRow">
      <label class="sr-only" for="alarm-time">Time</label>
      <input id="alarm-time" class="input time" type="time" bind:this={timeInput} bind:value={time} required />
      <label class="sr-only" for="alarm-label">Label</label>
      <input
        id="alarm-label"
        class="input text"
        type="text"
        placeholder="Label"
        maxlength="80"
        disabled={saving}
        bind:value={label}
      />
    </div>

    <fieldset class="days">
      <legend class="field-label">Repeat</legend>
      <div class="dayRow">
        {#each DAY_LABELS as dayLabel, day (day)}
          <button
            type="button"
            class="day"
            class:on={selectedDays.includes(day)}
            aria-pressed={selectedDays.includes(day)}
            aria-label={DAY_NAMES[day]}
            disabled={saving}
            onclick={() => toggleDay(day)}
          >
            {dayLabel.slice(0, 2)}
          </button>
        {/each}
      </div>
      <div class="presetRow">
        {#each DAY_PRESETS as preset (preset.label)}
          <button
            type="button"
            class="btn btn-quiet btn-sm"
            disabled={saving}
            onclick={() => applyDayPreset(preset.days)}
          >
            {preset.label}
          </button>
        {/each}
      </div>
    </fieldset>

    <div class="field">
      <span class="field-label">Sound</span>
      <SoundPicker bind:soundId bind:volume />
    </div>

    <p class="hint" aria-live="polite">{previewCaption}</p>

    <div class="actions">
      <button type="button" class="btn" onclick={testAlarm}><Icon name="bell" /> Test</button>
      <button type="submit" class="btn btn-primary grow" disabled={saving || !parsedTime}>
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Add alarm'}
      </button>
    </div>
  </form>

  {#if error}<p class="error-text" role="alert">{error}</p>{/if}
</section>

<style>
  .alarms {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    color: inherit;
    text-align: left;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .alarm {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.6rem 0.75rem 0.45rem;
    transition:
      border-color 140ms ease,
      opacity 140ms ease;
  }

  .alarm.editing {
    border-color: var(--accent, #8b7cf6);
  }

  .top,
  .bottom {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .clock {
    margin-right: auto;
    font-size: 1.75rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    line-height: 1.15;
  }

  .alarm.off .clock,
  .alarm.off .label {
    color: var(--fg-faint);
  }

  .detail {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .label {
    overflow: hidden;
    font-size: 0.85rem;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    gap: 0.3rem;
    color: var(--fg-muted);
    font-size: 0.72rem;
  }

  .rowActions {
    display: flex;
    gap: 0.05rem;
  }

  .rowActions .icon-btn {
    width: 1.8rem;
    height: 1.8rem;
  }

  .new {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.85rem;
  }

  .new.is-editing {
    border-color: var(--accent, #8b7cf6);
  }

  .formHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 1.75rem;
  }

  .topRow {
    display: flex;
    gap: 0.5rem;
  }

  .time {
    flex: 0 0 auto;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .text {
    flex: 1 1 auto;
  }

  .days {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0 0 0.35rem;
  }

  .dayRow {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.25rem;
  }

  .day {
    height: 2.1rem;
    padding: 0;
    border: 1px solid var(--hairline);
    border-radius: 0.6rem;
    background: transparent;
    color: var(--fg-muted);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 550;
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease,
      border-color 120ms ease;
  }

  .day:hover:not(:disabled) {
    border-color: var(--accent, #8b7cf6);
    color: var(--fg);
  }

  .day.on {
    border-color: transparent;
    background: var(--accent, #8b7cf6);
    color: var(--on-accent, #14121f);
    font-weight: 650;
  }

  .presetRow {
    display: flex;
    gap: 0.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .grow {
    flex: 1 1 auto;
  }
</style>
