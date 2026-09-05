<script lang="ts">
  import type { Settings } from '../lib/core/types'
  import { settings, settingsActions } from '../lib/ui/settings'

  const THEMES = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'auto', label: 'Auto' },
  ] as const satisfies readonly { value: Settings['theme']; label: string }[]

  const CLOCK_MODES = [
    { value: 'digital', label: 'Digital' },
    { value: 'analog', label: 'Analog' },
    { value: 'both', label: 'Both' },
  ] as const satisfies readonly { value: Settings['clockMode']; label: string }[]

  const fontScalePercent = $derived(`${Math.round($settings.fontScale * 100)}%`)
  const clockContrastPercent = $derived(`${Math.round($settings.clockContrast * 100)}%`)

  function update(patch: Partial<Settings>) {
    void settingsActions.update(patch)
  }
</script>

<section class="panel" aria-labelledby="theme-picker-heading">
  <h2 id="theme-picker-heading">Appearance</h2>

  <fieldset class="group">
    <legend>Theme</legend>
    <div class="options">
      {#each THEMES as option (option.value)}
        <label class="option" class:on={$settings.theme === option.value}>
          <input
            type="radio"
            name="chronly-theme"
            value={option.value}
            checked={$settings.theme === option.value}
            onchange={() => update({ theme: option.value })}
          />
          <span>{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Clock face</legend>
    <div class="options">
      {#each CLOCK_MODES as option (option.value)}
        <label class="option" class:on={$settings.clockMode === option.value}>
          <input
            type="radio"
            name="chronly-clock-mode"
            value={option.value}
            checked={$settings.clockMode === option.value}
            onchange={() => update({ clockMode: option.value })}
          />
          <span>{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <label class="toggle">
    <input type="checkbox" checked={$settings.hour12} onchange={(e) => update({ hour12: e.currentTarget.checked })} />
    <span>12-hour clock</span>
  </label>

  <label class="toggle">
    <input
      type="checkbox"
      checked={$settings.showSeconds}
      onchange={(e) => update({ showSeconds: e.currentTarget.checked })}
    />
    <span>Show seconds</span>
  </label>

  <div class="slider">
    <label for="chronly-font-scale">Text size</label>
    <input
      id="chronly-font-scale"
      type="range"
      min="0.5"
      max="2"
      step="0.1"
      value={$settings.fontScale}
      oninput={(e) => update({ fontScale: Number(e.currentTarget.value) })}
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
      oninput={(e) => update({ clockContrast: Number(e.currentTarget.value) })}
    />
    <output for="chronly-clock-contrast">{clockContrastPercent}</output>
  </div>

  <label class="toggle">
    <input
      type="checkbox"
      checked={$settings.reducedMotion}
      onchange={(e) => update({ reducedMotion: e.currentTarget.checked })}
    />
    <span>Reduce motion</span>
  </label>
</section>

<style>
  .panel {
    /* The popup root owns these; the fallbacks only matter when a panel is
       mounted on its own, as the tests do. */
    --surface: var(--tint, rgba(255, 255, 255, 0.04));
    --border: var(--hairline, rgba(255, 255, 255, 0.1));
    --muted: var(--fg-muted, rgba(245, 245, 247, 0.6));
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: 100%;
    color: var(--fg, #f5f5f7);
    font-family: system-ui, sans-serif;
    text-align: left;
  }

  h2 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .group {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  legend {
    padding: 0;
    font-size: 0.72rem;
    color: var(--muted);
  }

  .options {
    display: flex;
    gap: 0.3rem;
  }

  .option {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: var(--surface);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .option.on {
    border-color: var(--accent, #8b7cf6);
    color: var(--accent-ink, #8b7cf6);
  }

  /* The radio itself stays in the accessibility tree and keeps the group's
     arrow-key behaviour; only its default rendering is dropped. */
  .option input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .option:focus-within {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 1px;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  input[type='checkbox'] {
    accent-color: var(--accent, #8b7cf6);
    width: 0.95rem;
    height: 0.95rem;
    margin: 0;
  }

  .slider {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  .slider input {
    accent-color: var(--accent, #8b7cf6);
    min-width: 0;
  }

  output {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    min-width: 3ch;
    text-align: right;
  }

  :is(input, .option):focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 1px;
  }
</style>
