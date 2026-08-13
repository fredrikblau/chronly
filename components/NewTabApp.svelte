<script lang="ts">
  import { browser } from 'wxt/browser'
  import { formatTimeInZone, getDayOffset } from '../lib/core/time'
  import { createNowStore } from '../lib/ui/now'
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
    $settings.background.type === 'image' ? `url(${$settings.background.value})` : $settings.background.value,
  )

  const clocks = $derived($worldClocks ?? [])

  const COLOR_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi

  function parseColorChannels(css: string): [number, number, number] | null {
    const hex = /^#([0-9a-f]{3})([0-9a-f])?$|^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(css)
    if (hex) {
      const short = hex[1]
      const digits = short ? [...short].map((c) => c + c).join('') : (hex[3] ?? '')
      return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number]
    }
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(css)
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
    return null
  }

  /**
   * Mean perceived brightness (0..1) of every colour a background string
   * mentions, or null when none of them can be read (a named CSS colour, say).
   * Gradients carry several stops; averaging them, and skipping the sRGB gamma
   * ramp, is coarse but enough to answer the only question being asked — is
   * this surface dark or light?
   */
  function surfaceLuminance(css: string): number | null {
    const matches = css.match(COLOR_PATTERN) ?? [css.trim()]
    const values = matches
      .map(parseColorChannels)
      .filter((channels): channels is [number, number, number] => channels !== null)
      .map(([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  /**
   * The background is configured independently of the theme, so the theme on
   * its own cannot choose the text colour — 'auto' on a light desktop with the
   * default near-black background would print black on black. Whatever the text
   * actually sits on decides, and the theme is only consulted when that surface
   * is unreadable from here. An image is unknowable, so it gets a scrim and is
   * treated as dark.
   */
  const surface = $derived.by<'dark' | 'light' | 'unknown'>(() => {
    if ($settings.background.type === 'image') return 'dark'
    const luminance = surfaceLuminance($settings.background.value)
    if (luminance === null) return 'unknown'
    return luminance < 0.5 ? 'dark' : 'light'
  })

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
    /* fontScale sizes the page furniture. The clock face itself is already
       viewport-relative, which is the right behaviour on a full-tab surface. */
    font-size: calc(1rem * var(--font-scale, 1));
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
