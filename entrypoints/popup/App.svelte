<script lang="ts">
  import './theme.css'
  import AboutPanel from '../../components/AboutPanel.svelte'
  import AlarmsPanel from '../../components/AlarmsPanel.svelte'
  import BackgroundPicker from '../../components/BackgroundPicker.svelte'
  import CountdownPanel from '../../components/CountdownPanel.svelte'
  import Icon, { type IconName } from '../../components/Icon.svelte'
  import OverviewPanel from '../../components/OverviewPanel.svelte'
  import PomodoroPanel from '../../components/PomodoroPanel.svelte'
  import RingingBanner from '../../components/RingingBanner.svelte'
  import StopwatchPanel from '../../components/StopwatchPanel.svelte'
  import ThemePicker from '../../components/ThemePicker.svelte'
  import WorldClockPanel from '../../components/WorldClockPanel.svelte'
  import { createNowStore } from '../../lib/ui/now'
  import { resolveCanvas, SURFACE_BG, surfaceOf } from '../../lib/ui/palette'
  import { settings } from '../../lib/ui/settings'
  import { beginStorageLoad, storageLoadState } from '../../lib/ui/storageLoad'

  const now = createNowStore()
  beginStorageLoad()

  // 'auto' is resolved here rather than by a media query because the answer is
  // also needed in script, to decide the palette a picked background needs.
  let prefersLight = $state(false)

  $effect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!query) return
    prefersLight = query.matches
    const onChange = (event: MediaQueryListEvent) => (prefersLight = event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  })

  const themeSurface = $derived<'dark' | 'light'>(
    $settings.theme === 'auto' ? (prefersLight ? 'light' : 'dark') : $settings.theme,
  )

  const resolved = $derived(resolveCanvas($settings.background, themeSurface))
  const surface = $derived(resolved.surface)
  const canvas = $derived(resolved.canvas)

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
    { id: 'clock', label: 'Clock', icon: 'clock' },
    { id: 'alarms', label: 'Alarms', icon: 'alarm' },
    { id: 'timers', label: 'Timers', icon: 'timer' },
    { id: 'stopwatch', label: 'Stopwatch', icon: 'stopwatch' },
    { id: 'world', label: 'World', icon: 'globe' },
    { id: 'focus', label: 'Focus', icon: 'focus' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ] as const satisfies readonly { id: string; label: string; icon: IconName }[]
  type TabId = (typeof TABS)[number]['id']

  // The last tab is a per-device convenience, so it lives in localStorage
  // rather than synced settings. Every access is guarded: storage can be
  // unavailable, and the popup must open regardless.
  const LAST_TAB_KEY = 'chronly.lastTab'

  function readLastTab(): TabId {
    try {
      const saved = localStorage.getItem(LAST_TAB_KEY)
      return TABS.find((tab) => tab.id === saved)?.id ?? 'clock'
    } catch {
      return 'clock'
    }
  }

  let activeTab = $state<TabId>(readLastTab())

  function selectTab(id: TabId, focus = false) {
    activeTab = id
    try {
      localStorage.setItem(LAST_TAB_KEY, id)
    } catch {
      // Remembering the tab is optional.
    }
    if (focus) document.getElementById(`tab-${id}`)?.focus()
  }

  /** Roving arrow-key navigation, as expected of a tablist. */
  function onTabKeydown(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      selectTab(TABS[event.key === 'Home' ? 0 : TABS.length - 1].id, true)
      return
    }
    if (delta === 0) return
    event.preventDefault()
    selectTab(TABS[(index + delta + TABS.length) % TABS.length].id, true)
  }

  function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
    if (!(target instanceof HTMLInputElement)) return false
    return !['checkbox', 'radio', 'button', 'range', 'color', 'submit'].includes(target.type)
  }

  /** 1–7 jump straight to a tab, the way numbered tabs work in a browser. */
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || isTyping(event.target)) return
    const index = Number(event.key) - 1
    const tab = Number.isInteger(index) ? TABS[index] : undefined
    if (!tab || $storageLoadState !== 'ready') return
    event.preventDefault()
    selectTab(tab.id)
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="app"
  class:reduced-motion={$settings.reducedMotion}
  data-theme={$settings.theme}
  data-surface={surface}
  style:--bg={canvas}
  style:--bg-solid={SURFACE_BG[surface]}
  style:--accent={accent}
  style:--on-accent={onAccent}
>
  {#if $storageLoadState === 'error'}
    <div class="load-state error" role="alert">
      <Icon name="shield" size={28} />
      <p>Chronly could not load your saved data. Close and reopen the popup to try again.</p>
    </div>
  {:else}
    {#if $storageLoadState === 'loading'}
      <p class="load-state" role="status">Loading saved data…</p>
    {/if}
    <fieldset
      class="app-content"
      disabled={$storageLoadState === 'loading'}
      aria-busy={$storageLoadState === 'loading'}
    >
      <nav class="tabs" role="tablist" aria-label="Chronly sections">
        {#each TABS as tab, index (tab.id)}
          <button
            id="tab-{tab.id}"
            role="tab"
            type="button"
            class="tab"
            class:active={activeTab === tab.id}
            aria-selected={activeTab === tab.id}
            aria-controls="panel-{tab.id}"
            aria-keyshortcuts={String(index + 1)}
            title={`${tab.label} (${index + 1})`}
            tabindex={activeTab === tab.id ? 0 : -1}
            onclick={() => selectTab(tab.id)}
            onkeydown={(event) => onTabKeydown(event, index)}
          >
            <Icon name={tab.icon} size={18} />
            <span class="tab-label">{tab.label}</span>
          </button>
        {/each}
      </nav>

      <RingingBanner />

      <!--
        Panels stay mounted and are hidden rather than removed. The stores in
        lib/ui are module-level readables that stop tracking storage once their
        last subscriber goes away, so unmounting on every tab switch would leave
        a remounted panel briefly showing stale records.
      -->
      <main>
        <div id="panel-clock" role="tabpanel" aria-labelledby="tab-clock" hidden={activeTab !== 'clock'}>
          <OverviewPanel now={$now} onNavigate={(tab) => selectTab(tab)} />
        </div>

        <div id="panel-alarms" role="tabpanel" aria-labelledby="tab-alarms" hidden={activeTab !== 'alarms'}>
          <AlarmsPanel />
        </div>

        <div id="panel-timers" role="tabpanel" aria-labelledby="tab-timers" hidden={activeTab !== 'timers'}>
          <CountdownPanel />
        </div>

        <div id="panel-stopwatch" role="tabpanel" aria-labelledby="tab-stopwatch" hidden={activeTab !== 'stopwatch'}>
          <StopwatchPanel active={activeTab === 'stopwatch'} />
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
          <AboutPanel />
        </div>
      </main>
    </fieldset>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    width: 100%;
    /* Fills the popup so the surface under a short panel is the themed one and
       not whatever the page started as. */
    min-height: 100vh;
    background: var(--bg, #0b0b0f);
    background-attachment: fixed;
    background-size: cover;
    color: var(--fg);
    font-size: 0.9375rem;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }

  .tabs {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.125rem;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--hairline);
    position: sticky;
    top: 0;
    z-index: 2;
    /* Panels scroll under the strip, so it cannot be transparent. */
    background: var(--chrome);
    backdrop-filter: blur(12px);
  }

  .app-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .app-content:disabled {
    opacity: 0.35;
  }

  .load-state {
    margin: 1.5rem;
    color: var(--fg-muted);
    text-align: center;
  }

  .load-state.error {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    margin: 3rem 1.5rem;
    color: var(--danger);
  }

  .load-state.error p {
    margin: 0;
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.4rem 0.1rem 0.35rem;
    border: none;
    border-radius: 0.6rem;
    background: none;
    color: var(--fg-muted);
    font: inherit;
    cursor: pointer;
    transition:
      background 140ms ease,
      color 140ms ease;
  }

  .tab-label {
    max-width: 100%;
    overflow: hidden;
    font-size: 0.6875rem;
    letter-spacing: -0.005em;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab:hover {
    background: var(--tint);
    color: var(--fg);
  }

  .tab.active {
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .tab.active .tab-label {
    color: var(--fg);
  }

  .tab:focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: -2px;
  }

  main {
    flex: 1;
    padding: 0.875rem;
  }

  /* Must beat any display rule on a panel wrapper, which would otherwise win by
     source order and leave every panel on screen at once. */
  [hidden] {
    display: none !important;
  }

  .stacked {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
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
    width: 460px;
    min-height: 560px;
    background: var(--bg, #0b0b0f);
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
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
