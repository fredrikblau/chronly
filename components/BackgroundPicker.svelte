<script lang="ts">
  import { DEFAULT_SETTINGS, type BackgroundConfig } from '../lib/core/types'
  import { accentFromCss, isDefaultBackground, surfaceOf } from '../lib/ui/palette'
  import { settings, settingsActions } from '../lib/ui/settings'
  import Icon from './Icon.svelte'

  const GRADIENT_PRESETS = [
    { label: 'Midnight', value: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
    { label: 'Aurora', value: 'linear-gradient(135deg, #43cea2, #185a9d)' },
    { label: 'Dusk', value: 'linear-gradient(160deg, #1f1c2c, #3b2f63)' },
    { label: 'Ocean', value: 'linear-gradient(135deg, #2193b0, #6dd5ed)' },
    { label: 'Sunset', value: 'linear-gradient(135deg, #ff7e5f, #feb47b)' },
    { label: 'Paper', value: 'linear-gradient(160deg, #fbfaf7, #ecebf3)' },
  ]

  /** Picked to read well both as a fill and, carried toward the ink, as text. */
  const ACCENT_PRESETS = [
    { label: 'Violet', value: '#8b7cf6' },
    { label: 'Blue', value: '#4f8ff7' },
    { label: 'Teal', value: '#2bb3a0' },
    { label: 'Green', value: '#4caf6a' },
    { label: 'Amber', value: '#f0a73a' },
    { label: 'Coral', value: '#f2705b' },
    { label: 'Pink', value: '#e05ba1' },
  ]

  let error = $state<string | null>(null)
  let customStart = $state('#ff7e5f')
  let customEnd = $state('#feb47b')
  let customAngle = $state(135)

  const background = $derived($settings.background)
  const solidValue = $derived(background.type === 'solid' ? background.value : DEFAULT_SETTINGS.background.value)
  const isDefault = $derived(isDefaultBackground(background))
  const customPreview = $derived(`linear-gradient(${customAngle}deg, ${customStart}, ${customEnd})`)

  function apply(patch: Partial<BackgroundConfig>) {
    void settingsActions.update({ background: patch }).then(
      () => (error = null),
      () => (error = 'Could not save background settings. Try again.'),
    )
  }

  function setSolid(color: string) {
    error = null
    apply({ type: 'solid', value: color })
  }

  function setGradient(value: string) {
    error = null
    apply({ type: 'gradient', value })
  }

  function useThemeDefault() {
    error = null
    apply({ type: 'solid', value: DEFAULT_SETTINGS.background.value })
  }

  function setAccent(color: string) {
    apply({ accentColor: color })
  }

  function applyCustomGradient() {
    error = null
    apply({ type: 'gradient', value: customPreview })
  }

  function extractAccent() {
    const extracted = accentFromCss(background.value)
    if (!extracted) {
      error = 'The background colour could not be read.'
      return
    }
    error = null
    apply({ accentColor: extracted })
  }
</script>

<section class="panel" aria-labelledby="background-picker-heading">
  <header class="panel-head">
    <h2 id="background-picker-heading">Background</h2>
  </header>

  <p class="hint">
    {isDefault
      ? 'The default background follows your theme.'
      : 'Text colour now follows your background. Choose Default to follow the theme again.'}
  </p>

  <div class="gradients" role="group" aria-label="Gradient presets">
    <button
      type="button"
      class="gradient theme-default"
      aria-pressed={isDefault}
      aria-label="Default background"
      title="Follow the light or dark theme"
      onclick={useThemeDefault}
    >
      <span>Default</span>
    </button>
    {#each GRADIENT_PRESETS as preset (preset.label)}
      <button
        type="button"
        class="gradient"
        class:on-light={surfaceOf(preset.value, 'dark') === 'light'}
        style={`--preview: ${preset.value}`}
        aria-pressed={background.type === 'gradient' && background.value === preset.value}
        onclick={() => setGradient(preset.value)}
      >
        <span>{preset.label}</span>
      </button>
    {/each}
  </div>

  <div class="row">
    <label for="chronly-bg-solid">Solid colour</label>
    <input
      id="chronly-bg-solid"
      class="swatch"
      type="color"
      value={solidValue}
      onchange={(e) => setSolid(e.currentTarget.value)}
    />
  </div>

  <details class="custom-gradient card">
    <summary>Custom gradient</summary>
    <div class="gradient-body">
      <div class="gradient-preview" style:background={customPreview} aria-hidden="true"></div>
      <div class="gradient-controls">
        <label for="chronly-gradient-start">Start</label>
        <input id="chronly-gradient-start" class="swatch" type="color" bind:value={customStart} />
        <label for="chronly-gradient-end">End</label>
        <input id="chronly-gradient-end" class="swatch" type="color" bind:value={customEnd} />
      </div>
      <div class="angle">
        <label for="chronly-gradient-angle">Angle</label>
        <input id="chronly-gradient-angle" type="range" min="0" max="360" step="1" bind:value={customAngle} />
        <output for="chronly-gradient-angle">{customAngle}°</output>
      </div>
      <button type="button" class="btn btn-sm" onclick={applyCustomGradient}>Apply custom gradient</button>
    </div>
  </details>

  <fieldset class="accents">
    <legend class="field-label">Accent</legend>
    <div class="accent-row">
      {#each ACCENT_PRESETS as preset (preset.value)}
        <button
          type="button"
          class="accent-dot"
          style:--dot={preset.value}
          aria-label={`${preset.label} accent`}
          aria-pressed={background.accentColor.toLowerCase() === preset.value}
          onclick={() => setAccent(preset.value)}
        >
          {#if background.accentColor.toLowerCase() === preset.value}<Icon
              name="check"
              size={12}
              strokeWidth={3}
            />{/if}
        </button>
      {/each}
      <label class="sr-only" for="chronly-bg-accent">Accent colour</label>
      <input
        id="chronly-bg-accent"
        class="swatch"
        type="color"
        title="Any colour"
        value={background.accentColor}
        onchange={(e) => setAccent(e.currentTarget.value)}
      />
    </div>
    <button
      type="button"
      class="btn btn-quiet btn-sm match"
      aria-label="Auto-pick accent from background"
      onclick={extractAccent}
    >
      Match accent to background
    </button>
  </fieldset>

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

  .gradients {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
  }

  .gradient {
    position: relative;
    display: flex;
    align-items: flex-end;
    height: 3rem;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--hairline);
    border-radius: 0.65rem;
    background: var(--preview);
    color: #fff;
    font: inherit;
    font-size: 0.68rem;
    font-weight: 650;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.55);
    cursor: pointer;
    transition: transform 120ms ease;
  }

  .gradient:hover {
    transform: translateY(-1px);
  }

  .gradient.on-light {
    color: #16161a;
    text-shadow: none;
  }

  .gradient.theme-default {
    background: linear-gradient(135deg, #0b0b0f 58%, #f6f6f9 58%);
  }

  .gradient[aria-pressed='true'] {
    border-color: var(--accent, #8b7cf6);
    box-shadow:
      0 0 0 2px var(--accent, #8b7cf6),
      0 0 0 4px var(--bg-solid, #0b0b0f);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.85rem;
  }

  .custom-gradient {
    padding: 0;
    font-size: 0.85rem;
  }

  summary {
    padding: 0.6rem 0.75rem;
    cursor: pointer;
  }

  .gradient-body {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0 0.75rem 0.75rem;
  }

  .gradient-preview {
    height: 2.5rem;
    border: 1px solid var(--hairline);
    border-radius: 0.6rem;
  }

  .gradient-controls,
  .angle {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .angle input {
    flex: 1;
    min-width: 0;
  }

  output {
    min-width: 3.5ch;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .accents {
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

  .accent-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .accent-dot {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--dot);
    color: #fff;
    cursor: pointer;
    transition: transform 120ms ease;
  }

  .accent-dot:hover {
    transform: scale(1.08);
  }

  .accent-dot[aria-pressed='true'] {
    box-shadow:
      0 0 0 2px var(--bg-solid, #0b0b0f),
      0 0 0 4px var(--dot);
  }

  .match {
    align-self: flex-start;
    padding-left: 0;
  }
</style>
