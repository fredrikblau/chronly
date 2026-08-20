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
  import { settings } from '../../lib/ui/settings'

  const now = createNowStore()

  const TABS = [
    { id: 'clock', label: 'Clock' },
    { id: 'alarms', label: 'Alarms' },
    { id: 'timers', label: 'Timers' },
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

<div class="app" data-theme={$settings.theme}>
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
      <ClockFace now={$now} hour12={$settings.hour12} showSeconds={$settings.showSeconds} mode={$settings.clockMode} />
      <p class="date">{longDate}</p>
    </div>

    <div id="panel-alarms" role="tabpanel" aria-labelledby="tab-alarms" hidden={activeTab !== 'alarms'}>
      <AlarmsPanel />
    </div>

    <div id="panel-timers" role="tabpanel" aria-labelledby="tab-timers" hidden={activeTab !== 'timers'} class="stacked">
      <CountdownPanel />
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
  .app {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 100%;
  }

  .tabs {
    display: flex;
    gap: 0.125rem;
    padding: 0.5rem 0.75rem 0;
    border-bottom: 1px solid rgb(255 255 255 / 0.08);
    position: sticky;
    top: 0;
    z-index: 2;
    background: #0b0b0f;
  }

  .tab {
    flex: 1;
    appearance: none;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgb(245 245 247 / 0.55);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    /* Six tabs share a fixed 400px popup, so the longest label ("Settings")
       sets the floor here — any more horizontal padding wraps the strip. */
    padding: 0.5rem 0.125rem;
    min-width: 0;
    white-space: nowrap;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
  }

  .tab:hover {
    color: rgb(245 245 247 / 0.85);
    background: rgb(255 255 255 / 0.04);
  }

  .tab.active {
    color: #f5f5f7;
    border-bottom-color: #8b7cf6;
  }

  .tab:focus-visible {
    outline: 2px solid #8b7cf6;
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
    color: rgb(245 245 247 / 0.6);
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

  :global(body) {
    margin: 0;
    width: 400px;
    min-height: 320px;
    background: #0b0b0f;
    color: #f5f5f7;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab {
      transition: none;
    }
  }
</style>
