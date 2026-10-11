<script lang="ts">
  import type { Settings } from '../lib/core/types'
  import { settings, settingsActions } from '../lib/ui/settings'
  import Icon, { type IconName } from './Icon.svelte'

  const THEMES = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'auto', label: 'Auto', icon: 'auto' },
  ] as const satisfies readonly { value: Settings['theme']; label: string; icon: IconName }[]

  const CLOCK_MODES = [
    { value: 'digital', label: 'Digital' },
    { value: 'analog', label: 'Analog' },
    { value: 'both', label: 'Both' },
  ] as const satisfies readonly { value: Settings['clockMode']; label: string }[]

  const TOGGLES = [
    { key: 'hour12', label: '12-hour clock', hint: 'Show times as 7:30 PM instead of 19:30' },
    { key: 'showSeconds', label: 'Show seconds', hint: 'On the main clock' },
    { key: 'reducedMotion', label: 'Reduce motion', hint: 'Turn off animations' },
  ] as const satisfies readonly { key: keyof Settings; label: string; hint: string }[]

  const fontScalePercent = $derived(`${Math.round($settings.fontScale * 100)}%`)
  const clockContrastPercent = $derived(`${Math.round($settings.clockContrast * 100)}%`)
  let error = $state<string | null>(null)

  function update(patch: Partial<Settings>) {
    void settingsActions.update(patch).then(
      () => (error = null),
      () => (error = 'Could not save appearance settings. Try again.'),
    )
  }
</script>

<section class="panel" aria-labelledby="theme-picker-heading">
  <header class="panel-head">
    <h2 id="theme-picker-heading">Appearance</h2>
  </header>

  <fieldset class="group">
    <legend class="field-label">Theme</legend>
    <div class="segmented">
      {#each THEMES as option (option.value)}
        <label class="option" class:on={$settings.theme === option.value}>
          <input
            type="radio"
            name="chronly-theme"
            value={option.value}
            checked={$settings.theme === option.value}
            onchange={() => update({ theme: option.value })}
          />
          <span class="option-body"><Icon name={option.icon} size={14} />{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend class="field-label">Clock face</legend>
    <div class="segmented">
      {#each CLOCK_MODES as option (option.value)}
        <label class="option" class:on={$settings.clockMode === option.value}>
          <input
            type="radio"
            name="chronly-clock-mode"
            value={option.value}
            checked={$settings.clockMode === option.value}
            onchange={() => update({ clockMode: option.value })}
          />
          <span class="option-body">{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <div class="rows card">
    {#each TOGGLES as toggle (toggle.key)}
      <label class="toggle">
        <span class="toggle-text">
          <span>{toggle.label}</span>
          <small id="hint-{toggle.key}">{toggle.hint}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          class="switch"
          aria-label={toggle.label}
          aria-describedby="hint-{toggle.key}"
          checked={$settings[toggle.key]}
          onchange={(e) => update({ [toggle.key]: e.currentTarget.checked })}
        />
      </label>
    {/each}
  </div>

  <div class="rows card">
    <div class="slider">
      <label for="chronly-font-scale">Text size</label>
      <input
        id="chronly-font-scale"
        type="range"
        min="0.8"
        max="1.5"
        step="0.05"
        value={$settings.fontScale}
        onchange={(e) => update({ fontScale: Number(e.currentTarget.value) })}
      />
      <output for="chronly-font-scale">{fontScalePercent}</output>
    </div>

    <div class="slider">
      <label for="chronly-clock-contrast">Clock contrast</label>
      <input
        id="chronly-clock-contrast"
        type="range"
        min="0.75"
        max="1.5"
        step="0.05"
        value={$settings.clockContrast}
        onchange={(e) => update({ clockContrast: Number(e.currentTarget.value) })}
      />
      <output for="chronly-clock-contrast">{clockContrastPercent}</output>
    </div>
  </div>

  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    width: 100%;
    color: var(--fg, #f5f5f7);
    text-align: left;
  }

  .group {
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

  .option {
    position: relative;
  }

  .option-body {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .rows {
    display: flex;
    flex-direction: column;
  }

  .rows > * + * {
    border-top: 1px solid var(--hairline);
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    cursor: pointer;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
  }

  .toggle-text small {
    color: var(--fg-muted);
    font-size: 0.72rem;
  }

  .slider {
    display: grid;
    grid-template-columns: 6.5rem 1fr 3rem;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
  }

  .slider input {
    width: 100%;
    min-width: 0;
  }

  output {
    color: var(--fg-muted);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
