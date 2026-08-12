<script lang="ts">
  import {
    formatTimeInZone,
    formatUtcOffsetLabel,
    getRelativeDiffLabel,
    getUtcOffsetMinutes,
    zonedWallTimeToInstant,
  } from '../lib/core/time'
  import type { WorldClockEntry } from '../lib/core/types'
  import { createNowStore } from '../lib/ui/now'
  import { settings } from '../lib/ui/settings'
  import { worldClockActions, worldClocks } from '../lib/ui/worldClocks'

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
  let planning = $state(false)
  let plannedTime = $state('')

  const entries = $derived($worldClocks ?? [])
  const hour12 = $derived($settings.hour12)

  /** The instant every row is rendered at: right now, or the planned meeting slot. */
  const displayInstant = $derived(resolveInstant($now, planning, plannedTime))
  const planningActive = $derived(planning && /^\d{1,2}:\d{2}/.test(plannedTime))

  function localDateParts(at: Date): [number, number, number] {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: localZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
    const [year, month, day] = key.split('-').map(Number)
    return [year, month, day]
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

  function isKnownZone(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone })
      return true
    } catch {
      return false
    }
  }

  function cityFromZone(timeZone: string): string {
    const tail = timeZone.split('/').pop() ?? timeZone
    return tail.replace(/_/g, ' ')
  }

  function togglePlanning(checked: boolean) {
    planning = checked
    if (checked && !plannedTime) {
      plannedTime = formatTimeInZone(new Date($now), localZone, { hour12: false, showSeconds: false })
    }
  }

  function addZone() {
    const timeZone = newZone.trim()
    if (!timeZone) {
      error = 'Enter a time zone to add.'
      return
    }
    if (!isKnownZone(timeZone)) {
      error = `"${timeZone}" is not a time zone this browser knows.`
      return
    }
    if (entries.some((e) => e.timeZone.toLowerCase() === timeZone.toLowerCase())) {
      error = `${timeZone} is already on the list.`
      return
    }
    const entry: WorldClockEntry = {
      id: `wc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timeZone,
      label: newLabel.trim() || cityFromZone(timeZone),
      color: newColor,
      // Removals leave gaps in `order`, so append past the current maximum
      // rather than assuming it equals the list length.
      order: (entries.at(-1)?.order ?? -1) + 1,
    }
    void worldClockActions.upsert(entry)
    newZone = ''
    newLabel = ''
    error = null
  }

  function move(index: number, direction: -1 | 1) {
    const ids = entries.map((e) => e.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void worldClockActions.reorder(ids)
  }

  function remove(entry: WorldClockEntry) {
    void worldClockActions.remove(entry.id)
  }
</script>

<section class="panel" aria-labelledby="world-clock-heading">
  <header class="head">
    <h2 id="world-clock-heading">World clocks</h2>
    <div class="reference" class:planned={planningActive}>
      <span class="reference-label">{planningActive ? 'Meeting time' : 'Your time'}</span>
      <span class="reference-time">{timeIn(localZone)}</span>
      <span class="reference-zone">{localZone} · {offsetIn(localZone)}</span>
    </div>
  </header>

  <div class="planner">
    <label class="checkbox">
      <input type="checkbox" checked={planning} onchange={(e) => togglePlanning(e.currentTarget.checked)} />
      <span>Plan a meeting time</span>
    </label>
    {#if planning}
      <label class="planner-time">
        <span class="visually-hidden">Meeting time</span>
        <input type="time" bind:value={plannedTime} />
      </label>
    {/if}
  </div>

  {#if entries.length === 0}
    <p class="empty">No world clocks yet. Add a city below to keep an eye on it.</p>
  {:else}
    <ul class="list">
      {#each entries as entry, index (entry.id)}
        {@const reach = reachability(entry.timeZone)}
        <li class="row" style={`--row-accent: ${entry.color}`}>
          <div class="row-top">
            <span class="row-label">{entry.label}</span>
            <span class="row-time">{timeIn(entry.timeZone)}</span>
          </div>
          <div class="row-bottom">
            <span class="row-zone">{entry.timeZone}</span>
            <span class="chip">{offsetIn(entry.timeZone)}</span>
            <span class="chip">{getRelativeDiffLabel(localZone, entry.timeZone, displayInstant)}</span>
            <span class="chip reach reach-{reach.kind}">{reach.label}</span>
            <span class="row-actions">
              <button
                type="button"
                class="icon"
                aria-label={`Move ${entry.label} up`}
                disabled={index === 0}
                onclick={() => move(index, -1)}>↑</button
              >
              <button
                type="button"
                class="icon"
                aria-label={`Move ${entry.label} down`}
                disabled={index === entries.length - 1}
                onclick={() => move(index, 1)}>↓</button
              >
              <button
                type="button"
                class="icon danger"
                aria-label={`Remove ${entry.label}`}
                onclick={() => remove(entry)}>✕</button
              >
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    class="add"
    onsubmit={(e) => {
      e.preventDefault()
      addZone()
    }}
  >
    <input
      class="field zone"
      list="chronly-zone-options"
      aria-label="Time zone"
      placeholder="Time zone (e.g. Asia/Tokyo)"
      autocomplete="off"
      bind:value={newZone}
    />
    <datalist id="chronly-zone-options">
      {#each zoneOptions as zone (zone)}
        <option value={zone}></option>
      {/each}
    </datalist>
    <input class="field label" type="text" aria-label="Label" placeholder="Label" bind:value={newLabel} />
    <input class="swatch" type="color" aria-label="Colour" bind:value={newColor} />
    <button class="add-button" type="submit">Add</button>
  </form>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</section>

<style>
  .panel {
    --accent: #8b7cf6;
    --surface: rgba(255, 255, 255, 0.04);
    --border: rgba(255, 255, 255, 0.1);
    --muted: rgba(245, 245, 247, 0.6);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    color: #f5f5f7;
    font-family: system-ui, sans-serif;
    text-align: left;
  }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .reference {
    display: grid;
    grid-template-columns: auto auto;
    justify-items: end;
    align-items: baseline;
    column-gap: 0.5rem;
  }

  .reference-label {
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .reference-time {
    font-size: 1.5rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .reference-zone {
    grid-column: 1 / -1;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .reference.planned .reference-time,
  .reference.planned .reference-label {
    color: var(--accent);
  }

  .planner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    background: var(--surface);
    font-size: 0.8rem;
  }

  .checkbox {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }

  input[type='checkbox'] {
    accent-color: var(--accent);
    width: 0.95rem;
    height: 0.95rem;
    margin: 0;
  }

  .planner-time input {
    font: inherit;
    color: inherit;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--border);
    border-radius: 0.4rem;
    padding: 0.15rem 0.35rem;
    font-variant-numeric: tabular-nums;
  }

  .empty {
    margin: 0;
    padding: 0.9rem 0.6rem;
    border: 1px dashed var(--border);
    border-radius: 0.6rem;
    font-size: 0.8rem;
    color: var(--muted);
    text-align: center;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .row {
    position: relative;
    padding: 0.5rem 0.6rem 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
    background: var(--surface);
    overflow: hidden;
  }

  .row::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--row-accent, var(--accent));
  }

  .row-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .row-label {
    font-size: 0.95rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-time {
    font-size: 1.25rem;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }

  .row-bottom {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
    font-size: 0.68rem;
    color: var(--muted);
  }

  .row-zone {
    max-width: 11ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip {
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    font-variant-numeric: tabular-nums;
  }

  .reach-work {
    color: #7ee2b8;
    background: rgba(126, 226, 184, 0.14);
  }

  .reach-fringe {
    color: #f0c674;
    background: rgba(240, 198, 116, 0.14);
  }

  .reach-night {
    color: #f3948f;
    background: rgba(243, 148, 143, 0.14);
  }

  .row-actions {
    display: inline-flex;
    gap: 0.15rem;
    margin-left: auto;
  }

  .icon {
    width: 1.4rem;
    height: 1.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0.35rem;
    background: transparent;
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1;
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  .icon:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #f5f5f7;
  }

  .icon.danger:hover:not(:disabled) {
    background: rgba(243, 148, 143, 0.18);
    color: #f3948f;
  }

  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .add {
    display: grid;
    grid-template-columns: 1fr auto auto;
    grid-template-areas: 'zone swatch add' 'label label label';
    gap: 0.35rem;
  }

  .field {
    font: inherit;
    font-size: 0.8rem;
    color: inherit;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    padding: 0.35rem 0.5rem;
    min-width: 0;
  }

  .field::placeholder {
    color: rgba(245, 245, 247, 0.35);
  }

  .zone {
    grid-area: zone;
  }

  .label {
    grid-area: label;
  }

  .swatch {
    grid-area: swatch;
    width: 1.9rem;
    height: 1.9rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: transparent;
    cursor: pointer;
  }

  .add-button {
    grid-area: add;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    color: #0b0b0f;
    background: var(--accent);
    border: none;
    border-radius: 0.45rem;
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .add-button:hover {
    filter: brightness(1.1);
  }

  :is(.field, .icon, .add-button, input):focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .error {
    margin: 0;
    font-size: 0.72rem;
    color: #f3948f;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
