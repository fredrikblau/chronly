<script lang="ts">
  import {
    cityFromZone,
    formatTimeInZone,
    formatUtcOffsetLabel,
    getCalendarDateParts,
    getRelativeDiffLabel,
    getUtcOffsetMinutes,
    resolveTimeZone,
    zonedWallTimeToInstant,
  } from '../lib/core/time'
  import type { WorldClockEntry } from '../lib/core/types'
  import { createNowStore } from '../lib/ui/now'
  import { settings } from '../lib/ui/settings'
  import { offerUndo } from '../lib/ui/toast'
  import { worldClockActions, worldClocks } from '../lib/ui/worldClocks'
  import Icon from './Icon.svelte'

  const ACCENT = '#8b7cf6'

  const now = createNowStore()
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // The zone list comes straight from the runtime's own tzdata: no bundled city
  // table to go stale when a government moves a DST boundary, and no gaps.
  const zoneOptions = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [localZone]

  let newZone = $state('')
  let newLabel = $state('')
  let newColor = $state(ACCENT)
  let error = $state<string | null>(null)
  let saving = $state(false)
  let planning = $state(false)
  let plannedTime = $state('')

  const entries = $derived($worldClocks ?? [])
  const hour12 = $derived($settings.hour12)

  /** The instant every row is rendered at: right now, or the planned meeting slot. */
  const displayInstant = $derived(resolveInstant($now, planning, plannedTime))
  const planningActive = $derived(planning && /^\d{1,2}:\d{2}/.test(plannedTime))

  function localDateParts(at: Date): [number, number, number] {
    return getCalendarDateParts(at, localZone)
  }

  function resolveInstant(nowMs: number, isPlanning: boolean, hhmm: string): Date {
    const base = new Date(nowMs)
    if (!isPlanning) return base
    const match = /^(\d{1,2}):(\d{2})/.exec(hhmm)
    if (!match) return base
    const [year, month, day] = localDateParts(base)
    return zonedWallTimeToInstant(localZone, year, month, day, Number(match[1]), Number(match[2]))
  }

  function timeIn(timeZone: string): string {
    return formatTimeInZone(displayInstant, timeZone, { hour12, showSeconds: false })
  }

  function offsetIn(timeZone: string): string {
    return formatUtcOffsetLabel(getUtcOffsetMinutes(timeZone, displayInstant))
  }

  function hourIn(timeZone: string, at: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
    }).formatToParts(at)
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  }

  /**
   * The point of a meeting planner: tell the user at a glance whether the slot
   * they picked is civil for the people on the other end.
   */
  function reachability(timeZone: string): { kind: 'work' | 'fringe' | 'night'; label: string } {
    const hour = hourIn(timeZone, displayInstant)
    if (hour >= 9 && hour < 18) return { kind: 'work', label: 'Working hours' }
    if (hour >= 7 && hour < 22) return { kind: 'fringe', label: 'Off hours' }
    return { kind: 'night', label: 'Asleep' }
  }

  function togglePlanning(checked: boolean) {
    planning = checked
    if (checked && !plannedTime) {
      plannedTime = formatTimeInZone(new Date($now), localZone, { hour12: false, showSeconds: false })
    }
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

  /**
   * The name to show when no label is typed: the city as it was typed ("San
   * Francisco", not the "Los Angeles" zone it keeps time with), or the city
   * inside a typed zone id.
   */
  function placeName(typed: string, timeZone: string): string {
    if (typed.includes('/')) return cityFromZone(timeZone)
    if (typed !== typed.toLowerCase()) return typed
    return typed.replace(/(^|[\s-])(\p{L})/gu, (_match, start: string, letter: string) => start + letter.toUpperCase())
  }

  async function addZone() {
    const typed = newZone.trim()
    if (!typed) {
      error = 'Enter a city or time zone to add.'
      return
    }
    const timeZone = resolveTimeZone(typed, zoneOptions)
    if (!timeZone) {
      error = `Could not find "${typed}". Try a city such as Tokyo, or a zone such as Asia/Tokyo.`
      return
    }
    if (entries.some((e) => e.timeZone.toLowerCase() === timeZone.toLowerCase())) {
      error = `${cityFromZone(timeZone)} (${timeZone}) is already on the list.`
      return
    }
    const entry: WorldClockEntry = {
      id: `wc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timeZone,
      label: newLabel.trim() || placeName(typed, timeZone),
      color: newColor,
      // Removals leave gaps in `order`, so append past the current maximum
      // rather than assuming it equals the list length.
      order: (entries.at(-1)?.order ?? -1) + 1,
    }
    if (!(await save(() => worldClockActions.upsert(entry), 'Could not save that world clock. Try again.'))) return
    newZone = ''
    newLabel = ''
  }

  async function move(index: number, direction: -1 | 1) {
    const ids = entries.map((e) => e.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await save(() => worldClockActions.reorder(ids), 'Could not reorder the world clocks. Try again.')
  }

  async function remove(entry: WorldClockEntry) {
    if (await save(() => worldClockActions.remove(entry.id), 'Could not remove that world clock. Try again.')) {
      offerUndo(`Removed ${entry.label}`, () => worldClockActions.upsert(entry))
    }
  }
</script>

<section class="panel" aria-labelledby="world-clock-heading">
  <header class="panel-head">
    <h2 id="world-clock-heading">World clocks</h2>
    {#if entries.length}<span class="panel-meta">{entries.length} saved</span>{/if}
  </header>

  <div class="reference card" class:planned={planningActive}>
    <div class="reference-text">
      <span class="reference-label">{planningActive ? 'Meeting time here' : 'Your time'}</span>
      <span class="reference-zone">{cityFromZone(localZone)} · {offsetIn(localZone)}</span>
    </div>
    <span class="reference-time">{timeIn(localZone)}</span>
  </div>

  <div class="planner">
    <label class="planner-toggle">
      <input
        type="checkbox"
        role="switch"
        class="switch"
        checked={planning}
        onchange={(e) => togglePlanning(e.currentTarget.checked)}
      />
      <span>Plan a meeting time</span>
    </label>
    {#if planning}
      <label class="planner-time">
        <span class="sr-only">Meeting time</span>
        <input class="input" type="time" bind:value={plannedTime} />
      </label>
    {/if}
  </div>

  {#if entries.length === 0}
    <div class="empty-state">
      <Icon name="globe" size={22} />
      <strong>No world clocks yet</strong>
      <span>Add a city below to keep an eye on it.</span>
    </div>
  {:else}
    <ul class="list">
      {#each entries as entry, index (entry.id)}
        {@const reach = reachability(entry.timeZone)}
        <li class="row card" style={`--row-accent: ${entry.color}`}>
          <div class="row-top">
            <span class="row-label">{entry.label}</span>
            <span class="row-time">{timeIn(entry.timeZone)}</span>
          </div>
          <div class="row-bottom">
            <span class="chip">{offsetIn(entry.timeZone)}</span>
            <span class="chip">{getRelativeDiffLabel(localZone, entry.timeZone, displayInstant)}</span>
            <span class="chip reach reach-{reach.kind}">{reach.label}</span>
            <span class="row-actions">
              <button
                type="button"
                class="icon-btn"
                aria-label={`Move ${entry.label} up`}
                disabled={saving || index === 0}
                onclick={() => move(index, -1)}><Icon name="up" size={14} /></button
              >
              <button
                type="button"
                class="icon-btn"
                aria-label={`Move ${entry.label} down`}
                disabled={saving || index === entries.length - 1}
                onclick={() => move(index, 1)}><Icon name="down" size={14} /></button
              >
              <button
                type="button"
                class="icon-btn danger"
                aria-label={`Remove ${entry.label}`}
                disabled={saving}
                onclick={() => remove(entry)}><Icon name="trash" size={14} /></button
              >
            </span>
          </div>
          <span class="row-zone">{entry.timeZone}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    class="add card"
    aria-labelledby="world-form-title"
    onsubmit={(e) => {
      e.preventDefault()
      void addZone()
    }}
  >
    <h3 id="world-form-title" class="section-title">Add a city</h3>
    <input
      class="input zone"
      list="chronly-zone-options"
      aria-label="Time zone"
      placeholder="City or time zone, e.g. New York"
      autocomplete="off"
      disabled={saving}
      bind:value={newZone}
    />
    <datalist id="chronly-zone-options">
      {#each zoneOptions as zone (zone)}
        <option value={zone} label={cityFromZone(zone)}></option>
      {/each}
    </datalist>
    <div class="add-row">
      <input
        class="input label"
        type="text"
        aria-label="Label"
        placeholder="Label"
        maxlength="40"
        disabled={saving}
        bind:value={newLabel}
      />
      <input class="swatch" type="color" aria-label="Colour" title="Colour" disabled={saving} bind:value={newColor} />
      <button class="btn btn-primary" type="submit" disabled={saving}>
        <Icon name="plus" size={14} />
        {saving ? 'Saving…' : 'Add'}
      </button>
    </div>
  </form>

  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    color: var(--fg, #f5f5f7);
    text-align: left;
  }

  .reference {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.8rem;
  }

  .reference-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .reference-label {
    color: var(--fg-muted);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .reference-zone {
    overflow: hidden;
    color: var(--fg-muted);
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reference-time {
    font-size: 1.75rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .reference.planned {
    border-color: var(--accent, #8b7cf6);
    background: var(--accent-soft);
  }

  .reference.planned .reference-time,
  .reference.planned .reference-label {
    color: var(--accent-ink, #8b7cf6);
  }

  .planner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    min-height: 2.125rem;
    font-size: 0.85rem;
  }

  .planner-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    cursor: pointer;
  }

  .planner-time input {
    font-variant-numeric: tabular-nums;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    position: relative;
    overflow: hidden;
    padding: 0.55rem 0.6rem 0.5rem 0.85rem;
  }

  .row::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--row-accent, var(--accent, #8b7cf6));
  }

  .row-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .row-label {
    overflow: hidden;
    font-size: 0.95rem;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-time {
    font-size: 1.4rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  .row-bottom {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.25rem;
  }

  .row-zone {
    display: block;
    margin-top: 0.15rem;
    color: var(--fg-muted);
    font-size: 0.68rem;
  }

  .chip {
    font-variant-numeric: tabular-nums;
  }

  .reach-work {
    background: var(--success-tint);
    color: var(--success);
  }

  .reach-fringe {
    background: var(--warn-tint);
    color: var(--warn);
  }

  .reach-night {
    background: var(--danger-tint);
    color: var(--danger);
  }

  .row-actions {
    display: inline-flex;
    gap: 0.05rem;
    margin-left: auto;
  }

  .row-actions .icon-btn {
    width: 1.7rem;
    height: 1.7rem;
  }

  .add {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.85rem;
  }

  .add-row {
    display: flex;
    gap: 0.4rem;
  }

  .label {
    flex: 1;
  }
</style>
