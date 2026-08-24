<script lang="ts">
  import { browser } from 'wxt/browser'
  import { formatTimeInZone, getDayOffset } from '../lib/core/time'
  import { createNowStore } from '../lib/ui/now'
  import { backgroundSurface, isSafeImageUrl } from '../lib/ui/palette'
  import { settings } from '../lib/ui/settings'
  import { worldClocks } from '../lib/ui/worldClocks'
  import ClockFace from './ClockFace.svelte'

  // A render clock only — the background worker owns everything that fires.
  const now = createNowStore()
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // The render clock ticks four times a second so the seconds digit stays
  // smooth, but nothing outside the clock face changes that often. Deriving the
  // rest from a minute-resolution tick means those recompute once a minute
  // instead of 240 times, on a page that is left open all day.
  const minuteTick = $derived(Math.floor($now / 60_000))
  const atMinute = $derived(new Date(minuteTick * 60_000))

  const longDate = $derived(dateFormatter.format(atMinute))

  // An uploaded or linked image is stored as a bare URL, so it needs wrapping
  // before it can stand in for a colour or gradient in the same `background`.
  const backgroundValue = $derived(
    $settings.background.type === 'image'
      ? isSafeImageUrl($settings.background.value)
        ? `url(${$settings.background.value.trim()})`
        : '#0b0b0f'
      : $settings.background.value,
  )

  const clocks = $derived($worldClocks ?? [])

  /**
   * Whatever the text actually sits on decides the palette; the theme is only
   * consulted, by the CSS below, when that surface cannot be measured. The
   * popup shares this reading of the background — see lib/ui/palette.
   */
  const surface = $derived(backgroundSurface($settings.background))

  // Seconds are deliberately dropped from the strip: it is a glance, not a
  // stopwatch, and a row of ticking digits fights the big clock for attention.
  const strip = $derived(
    clocks.map((entry) => ({
      id: entry.id,
      label: entry.label,
      color: entry.color,
      time: formatTimeInZone(atMinute, entry.timeZone, { hour12: $settings.hour12, showSeconds: false }),
      dayShift: getDayOffset(localZone, entry.timeZone, atMinute),
    })),
  )

  function dayShiftLabel(offset: number): string {
    if (offset === 1) return '+1 day'
    if (offset === -1) return '−1 day'
    return offset > 0 ? `+${offset} days` : `−${Math.abs(offset)} days`
  }

  type PopupOpener = { openPopup?: () => Promise<void> | void }

  let popupUnavailable = $state(false)

  async function openPopup(): Promise<void> {
    try {
      const action = (browser as unknown as { action?: PopupOpener }).action
      if (typeof action?.openPopup !== 'function') {
        popupUnavailable = true
        return
      }
      await action.openPopup()
    } catch {
      // openPopup() is recent and gesture-gated in Chrome and may reject
      // outright elsewhere, so failure is expected rather than exceptional.
      // The toolbar icon always works; point at it instead of failing silently.
      popupUnavailable = true
    }
  }

  /**
   * The page furniture sizes itself in rem, which resolves against the document
   * root and not this element, so the scale has to be set there to reach any of
   * it. The popup scales itself the same way.
   */
  $effect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-scale', String($settings.fontScale))
    return () => root.style.removeProperty('--font-scale')
  })
</script>

<div
  class="dashboard"
  class:reduced-motion={$settings.reducedMotion}
  class:on-dark={surface === 'dark'}
  class:on-light={surface === 'light'}
  class:image-bg={$settings.background.type === 'image'}
  data-theme={$settings.theme}
  style:--bg={backgroundValue}
  style:--accent={$settings.background.accentColor}
  style:--font-scale={$settings.fontScale}
>
  <main class="stage">
    <ClockFace
      now={$now}
      timeZone={localZone}
      hour12={$settings.hour12}
      showSeconds={$settings.showSeconds}
      mode={$settings.clockMode}
      contrast={$settings.clockContrast}
    />
    <p class="date">{longDate}</p>
  </main>

  {#if strip.length > 0}
    <ul class="strip" aria-label="World clocks">
      {#each strip as entry (entry.id)}
        <li class="zone">
          <span class="label" style:color={entry.color}>{entry.label}</span>
          <span class="time">{entry.time}</span>
          {#if entry.dayShift !== 0}
            <span class="shift">{dayShiftLabel(entry.dayShift)}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <footer class="quick-access">
    <button type="button" class="quick" onclick={openPopup}>Alarms &amp; timers</button>
    {#if popupUnavailable}
      <p class="hint" role="status">Open Chronly from the toolbar icon for alarms, timers, and Pomodoro.</p>
    {/if}
  </footer>
</div>

<style>
  :global(html) {
    /* Set on the document element by the effect above, so every rem below it
       follows the text-size setting. */
    font-size: calc(100% * var(--font-scale, 1));
  }

  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    /* Matches the default background so a slow settings read never flashes
       white before the dashboard paints. */
    background: #0b0b0f;
  }

  :global(*),
  :global(*::before),
  :global(*::after) {
    box-sizing: border-box;
  }

  .dashboard {
    /* Dark is the product default; the light values below override it. */
    --fg: #f5f5f7;
    --fg-muted: rgb(245 245 247 / 0.55);
    --hairline: rgb(255 255 255 / 0.12);

    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2rem, 7vh, 4.5rem);
    padding: clamp(1.5rem, 5vh, 4rem) clamp(1rem, 5vw, 4rem);
    background: var(--bg, #0b0b0f);
    background-size: cover;
    background-position: center;
    color: var(--fg);
    /* The scale lives on the document root; sizing in rem here would apply it a
       second time. The clock face stays viewport-relative, which is the right
       behaviour on a full-tab surface. */
    font-size: 1rem;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
  }

  .dashboard[data-theme='light'] {
    --fg: #16161a;
    --fg-muted: rgb(22 22 26 / 0.6);
    --hairline: rgb(0 0 0 / 0.14);
  }

  @media (prefers-color-scheme: light) {
    .dashboard[data-theme='auto'] {
      --fg: #16161a;
      --fg-muted: rgb(22 22 26 / 0.6);
      --hairline: rgb(0 0 0 / 0.14);
    }
  }

  /* Measured from the background itself, so these must beat the theme rules
     above — same specificity, later in the source. */
  .dashboard.on-light {
    --fg: #16161a;
    --fg-muted: rgb(22 22 26 / 0.6);
    --hairline: rgb(0 0 0 / 0.14);
  }

  .dashboard.on-dark {
    --fg: #f5f5f7;
    --fg-muted: rgb(245 245 247 / 0.55);
    --hairline: rgb(255 255 255 / 0.12);
  }

  /* Nothing can be assumed about an arbitrary photo, so darken it enough that
     the light palette is guaranteed to read. */
  .dashboard.image-bg {
    background-image: linear-gradient(rgb(0 0 0 / 0.45), rgb(0 0 0 / 0.45)), var(--bg);
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
  }

  .date {
    margin: 0;
    color: var(--fg-muted);
    font-size: 1rem;
    letter-spacing: 0.01em;
  }

  .strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: clamp(1.25rem, 4vw, 3rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 5rem;
  }

  .label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .time {
    font-variant-numeric: tabular-nums;
    font-size: 1.375rem;
    font-weight: 300;
    color: var(--fg);
  }

  .shift {
    font-size: 0.6875rem;
    color: var(--fg-muted);
  }

  .quick-access {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }

  .quick {
    appearance: none;
    background: transparent;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    color: var(--fg-muted);
    font: inherit;
    font-size: 0.875rem;
    padding: 0.5rem 1.375rem;
    cursor: pointer;
    transition:
      color 150ms ease,
      border-color 150ms ease;
  }

  .quick:hover {
    color: var(--fg);
    border-color: var(--accent, #8b7cf6);
  }

  .quick:focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 3px;
    color: var(--fg);
  }

  .hint {
    margin: 0;
    max-width: 28rem;
    text-align: center;
    font-size: 0.8125rem;
    color: var(--fg-muted);
  }

  /* Both the user's own toggle and the OS-level preference must be honoured. */
  .dashboard.reduced-motion :global(*) {
    animation: none !important;
    transition: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .dashboard :global(*) {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
