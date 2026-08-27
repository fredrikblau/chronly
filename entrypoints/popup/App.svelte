<script lang="ts">
  import AlarmsPanel from '../../components/AlarmsPanel.svelte'
  import BackgroundPicker from '../../components/BackgroundPicker.svelte'
  import ClockFace from '../../components/ClockFace.svelte'
  import CountdownPanel from '../../components/CountdownPanel.svelte'
  import PomodoroPanel from '../../components/PomodoroPanel.svelte'
  import StopwatchPanel from '../../components/StopwatchPanel.svelte'
  import ThemePicker from '../../components/ThemePicker.svelte'
  import WorldClockPanel from '../../components/WorldClockPanel.svelte'
  import { createNowStore } from '../../lib/ui/now'
  import { backgroundSurface, surfaceOf } from '../../lib/ui/palette'
  import { settings } from '../../lib/ui/settings'

  const now = createNowStore()

  // The plain surfaces the popup falls back to when the saved background is not
  // one it can paint. They are the two ends of the palette below.
  const SURFACE_BG = { dark: '#0b0b0f', light: '#f6f6f9' } as const

  // 'auto' is resolved here rather than by a media query because the answer is
  // also needed in script, to decide whether the saved background can be
  // painted under the resolved palette.
  let prefersLight = $state(false)

  $effect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!query) return
    prefersLight = query.matches
    const onChange = (event: MediaQueryListEvent) => (prefersLight = event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  })

  const surface = $derived<'dark' | 'light'>(
    $settings.theme === 'auto' ? (prefersLight ? 'light' : 'dark') : $settings.theme,
  )

  /**
   * The popup is a 400px control surface rather than a canvas, so it only takes
   * the saved background on when that background reads the same way round as
   * the palette. The default is near-black: painting it under a user who asked
   * for Light would print near-black text on near-black, which is exactly the
   * trap the New Tab dashboard sidesteps by measuring the background. An image
   * is never painted here — dense controls need a plain surface, and fetching
   * it would tell whoever hosts it every time the toolbar button is clicked.
   */
  const canvas = $derived(
    $settings.background.type !== 'image' && backgroundSurface($settings.background) === surface
      ? $settings.background.value
      : SURFACE_BG[surface],
  )

  const accent = $derived($settings.background.accentColor)

  // Ink for anything printed on an accent fill. The accent is picked freely and
  // can land anywhere on the scale, so the fill decides its own text colour.
  const onAccent = $derived(surfaceOf(accent, 'dark') === 'light' ? '#14121f' : '#f5f5f7')

  /**
   * Every panel sizes itself in rem, which resolves against the document root —
   * outside this component — so scaling the popup's text means scaling that.
   * The background rides along so the page behind a short popup matches, and
   * color-scheme hands the resolved palette to the native controls (range
   * thumbs, colour swatches, scrollbars) that CSS variables cannot reach.
   */
  $effect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-scale', String($settings.fontScale))
    root.style.setProperty('--bg', canvas)
    root.style.colorScheme = surface
    return () => {
      root.style.removeProperty('--font-scale')
      root.style.removeProperty('--bg')
      root.style.colorScheme = ''
    }
  })

  const TABS = [
    { id: 'clock', label: 'Clock' },
    { id: 'alarms', label: 'Alarms' },
    { id: 'timers', label: 'Timers' },
    { id: 'stopwatch', label: 'Stopwatch' },
    { id: 'world', label: 'World' },
    { id: 'focus', label: 'Focus' },
    { id: 'settings', label: 'Settings' },
  ] as const
  type TabId = (typeof TABS)[number]['id']

  let activeTab = $state<TabId>('clock')

  const longDate = $derived(
    new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date($now)),
  )

  /** Roving arrow-key navigation, as expected of a tablist. */
  function onTabKeydown(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const next = TABS[(index + delta + TABS.length) % TABS.length]
    activeTab = next.id
    const el = document.getElementById(`tab-${next.id}`)
    el?.focus()
  }
</script>

<div
  class="app"
  class:reduced-motion={$settings.reducedMotion}
  data-theme={$settings.theme}
  data-surface={surface}
  style:--bg={canvas}
  style:--accent={accent}
  style:--on-accent={onAccent}
>
  <div class="tabs" role="tablist" aria-label="Chronly sections">
    {#each TABS as tab, index (tab.id)}
      <button
        id="tab-{tab.id}"
        role="tab"
        type="button"
        class="tab"
        class:active={activeTab === tab.id}
        aria-selected={activeTab === tab.id}
        aria-controls="panel-{tab.id}"
        tabindex={activeTab === tab.id ? 0 : -1}
        onclick={() => (activeTab = tab.id)}
        onkeydown={(event) => onTabKeydown(event, index)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!--
    Panels stay mounted and are hidden rather than removed. The stores in
    lib/ui are module-level readables that stop tracking storage once their
    last subscriber goes away, so unmounting on every tab switch would leave a
    remounted panel briefly showing stale records.
  -->
  <main>
    <div
      id="panel-clock"
      role="tabpanel"
      aria-labelledby="tab-clock"
      hidden={activeTab !== 'clock'}
      class="clock-panel"
    >
      <ClockFace
        now={$now}
        hour12={$settings.hour12}
        showSeconds={$settings.showSeconds}
        mode={$settings.clockMode}
        contrast={$settings.clockContrast}
      />
      <p class="date">{longDate}</p>
    </div>

    <div id="panel-alarms" role="tabpanel" aria-labelledby="tab-alarms" hidden={activeTab !== 'alarms'}>
      <AlarmsPanel />
    </div>

    <div id="panel-timers" role="tabpanel" aria-labelledby="tab-timers" hidden={activeTab !== 'timers'} class="stacked">
      <CountdownPanel />
    </div>

    <div id="panel-stopwatch" role="tabpanel" aria-labelledby="tab-stopwatch" hidden={activeTab !== 'stopwatch'}>
      <StopwatchPanel />
    </div>

    <div id="panel-world" role="tabpanel" aria-labelledby="tab-world" hidden={activeTab !== 'world'}>
      <WorldClockPanel />
    </div>

    <div id="panel-focus" role="tabpanel" aria-labelledby="tab-focus" hidden={activeTab !== 'focus'}>
      <PomodoroPanel />
    </div>

    <div
      id="panel-settings"
      role="tabpanel"
      aria-labelledby="tab-settings"
      hidden={activeTab !== 'settings'}
      class="stacked"
    >
      <ThemePicker />
      <BackgroundPicker />
    </div>
  </main>
</div>

<style>
  /*
    The one place the popup's colours are declared. Every panel reads these and
    keeps only a fallback of its own, so the accent the user picks reaches all
    six tabs and the light palette is not something each panel can forget.
    Dark is the product default; [data-surface='light'] below overrides it.
  */
  .app {
    --fg: #f5f5f7;
    --fg-muted: rgb(245 245 247 / 0.62);
    --fg-faint: rgb(245 245 247 / 0.35);
    --tint: rgb(255 255 255 / 0.045);
    --tint-strong: rgb(255 255 255 / 0.1);
    --hairline: rgb(255 255 255 / 0.1);
    --field: rgb(0 0 0 / 0.25);
    --chrome: rgb(11 11 15 / 0.94);
    --danger: #fca5a5;
    --danger-tint: rgb(248 113 113 / 0.16);
    --success: #6ee7b7;
    --success-tint: rgb(110 231 183 / 0.14);
    --warn: #f0c674;
    --warn-tint: rgb(240 198 116 / 0.14);
    --phase-short: #4ec9b0;
    --phase-long: #5aa9f7;
    /* The accent is chosen freely and is often a mid-tone. As a fill it is
       fine; set in type it has to clear the surface it is printed on, so text
       takes this instead. */
    --accent-ink: var(--accent, #8b7cf6);

    display: flex;
    flex-direction: column;
    width: 100%;
    /* Fills the popup so the surface under a short panel is the themed one and
       not whatever the page started as. */
    min-height: 100vh;
    background: var(--bg, #0b0b0f);
    background-size: cover;
    color: var(--fg);
  }

  /*
    Light is not the dark palette with the text flipped: translucent white
    washes disappear on it, and the mid-tone status colours that read on black
    fall under 3:1 on white. Each token is picked against #f6f6f9.
  */
  .app[data-surface='light'] {
    --fg: #16161a;
    --fg-muted: rgb(22 22 26 / 0.68);
    --fg-faint: rgb(22 22 26 / 0.45);
    --tint: rgb(16 16 24 / 0.05);
    --tint-strong: rgb(16 16 24 / 0.11);
    --hairline: rgb(16 16 24 / 0.18);
    --field: #ffffff;
    --chrome: rgb(246 246 249 / 0.94);
    --danger: #b3261e;
    --danger-tint: rgb(179 38 30 / 0.12);
    --success: #0b6b4f;
    --success-tint: rgb(11 107 79 / 0.12);
    --warn: #7a5200;
    --warn-tint: rgb(122 82 0 / 0.12);
    --phase-short: #0f7a63;
    --phase-long: #14539f;
    /* The default accent is a mid violet: 2.6:1 on this surface as text, and a
       pastel one is worse. Carrying it towards the ink keeps the hue and clears
       4.5:1. */
    --accent-ink: color-mix(in srgb, var(--accent, #8b7cf6) 58%, #16161a);
  }

  .tabs {
    display: flex;
    /* The popup stays 400px wide however large the text is set, so past roughly
       130% the six labels stop fitting on one line. Wrapping onto a second row
       keeps them all readable; squeezing them made them overlap. */
    flex-wrap: wrap;
    gap: 0.125rem;
    padding: 0.5rem 0.75rem 0;
    border-bottom: 1px solid var(--hairline);
    position: sticky;
    top: 0;
    z-index: 2;
    /* Panels scroll under the strip, so it cannot be transparent. */
    background: var(--chrome);
  }

  .tab {
    flex: 1;
    appearance: none;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-muted);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    /* Six tabs share a fixed 400px popup, so the longest label ("Settings")
       sets the floor here — any more horizontal padding wraps the strip. */
    padding: 0.5rem 0.125rem;
    min-width: max-content;
    white-space: nowrap;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
  }

  .tab:hover {
    color: var(--fg);
    background: var(--tint);
  }

  .tab.active {
    color: var(--fg);
    border-bottom-color: var(--accent, #8b7cf6);
  }

  .tab:focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: -2px;
  }

  main {
    flex: 1;
    padding: 0.875rem;
  }

  /* Must beat the display rules on .clock-panel and .stacked below, which have
     equal specificity and would otherwise win by source order and leave every
     panel on screen at once. */
  [hidden] {
    display: none !important;
  }

  .clock-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem 0 2rem;
  }

  .date {
    margin: 0;
    color: var(--fg-muted);
    font-size: 0.875rem;
  }

  .stacked {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Panels size inputs with width:100% plus their own padding and border, which
     overflows the popup without this. */
  :global(*),
  :global(*::before),
  :global(*::after) {
    box-sizing: border-box;
  }

  /* --font-scale and --bg are set on the document element by the effect above:
     rem resolves against the root, and the root is what paints the area a short
     popup does not cover. */
  :global(html) {
    font-size: calc(100% * var(--font-scale, 1));
  }

  :global(body) {
    margin: 0;
    width: 480px;
    min-height: 520px;
    background: var(--bg, #0b0b0f);
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
  }

  /* Both the user's own toggle and the OS-level preference must be honoured: a
     media query cannot read a stored setting, and the setting must not silently
     re-enable motion for someone whose system already asked for none. */
  .app.reduced-motion :global(*) {
    animation: none !important;
    transition: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .app :global(*) {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
