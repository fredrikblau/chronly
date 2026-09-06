<script lang="ts">
  import type { BackgroundConfig } from '../lib/core/types'
  import { accentFromCss } from '../lib/ui/palette'
  import { settings, settingsActions } from '../lib/ui/settings'

  const GRADIENT_PRESETS = [
    { label: 'Sunset', value: 'linear-gradient(135deg, #ff7e5f, #feb47b)' },
    { label: 'Aurora', value: 'linear-gradient(135deg, #43cea2, #185a9d)' },
    { label: 'Midnight', value: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
    { label: 'Ocean', value: 'linear-gradient(135deg, #2193b0, #6dd5ed)' },
  ]

  let error = $state<string | null>(null)
  let customStart = $state('#ff7e5f')
  let customEnd = $state('#feb47b')
  let customAngle = $state(135)

  const background = $derived($settings.background)
  const solidValue = $derived(background.type === 'solid' ? background.value : '#0b0b0f')

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

  function setAccent(color: string) {
    apply({ accentColor: color })
  }

  function applyCustomGradient() {
    error = null
    apply({ type: 'gradient', value: `linear-gradient(${customAngle}deg, ${customStart}, ${customEnd})` })
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
  <h2 id="background-picker-heading">Background</h2>

  <div class="row">
    <label for="chronly-bg-solid">Solid colour</label>
    <input
      id="chronly-bg-solid"
      class="swatch"
      type="color"
      value={solidValue}
      onchange={(e) => setSolid(e.currentTarget.value)}
    />
    <label for="chronly-bg-accent">Accent colour</label>
    <input
      id="chronly-bg-accent"
      class="swatch"
      type="color"
      value={background.accentColor}
      onchange={(e) => setAccent(e.currentTarget.value)}
    />
  </div>

  <div class="gradients" role="group" aria-label="Gradient presets">
    {#each GRADIENT_PRESETS as preset (preset.label)}
      <button
        type="button"
        class="gradient"
        style={`--preview: ${preset.value}`}
        aria-pressed={background.type === 'gradient' && background.value === preset.value}
        onclick={() => setGradient(preset.value)}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <fieldset class="custom-gradient">
    <legend>Custom gradient</legend>
    <div class="gradient-controls">
      <label for="chronly-gradient-start">Start</label>
      <input id="chronly-gradient-start" class="swatch" type="color" bind:value={customStart} />
      <label for="chronly-gradient-end">End</label>
      <input id="chronly-gradient-end" class="swatch" type="color" bind:value={customEnd} />
      <label for="chronly-gradient-angle">Angle</label>
      <input id="chronly-gradient-angle" type="range" min="0" max="360" step="1" bind:value={customAngle} />
      <output for="chronly-gradient-angle">{customAngle}°</output>
    </div>
    <button type="button" class="action" onclick={applyCustomGradient}>Apply custom gradient</button>
  </fieldset>

  <button type="button" class="action" onclick={extractAccent}>Auto-pick accent from background</button>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
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

  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
  }

  .row label:nth-of-type(2) {
    margin-left: auto;
  }

  .swatch {
    width: 1.9rem;
    height: 1.9rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: transparent;
    cursor: pointer;
  }

  .gradients {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.35rem;
  }

  .gradient {
    position: relative;
    height: 2.4rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: var(--preview);
    color: #fff;
    font: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    cursor: pointer;
  }

  .gradient[aria-pressed='true'] {
    border-color: var(--accent, #8b7cf6);
    box-shadow: 0 0 0 1px var(--accent, #8b7cf6);
  }

  .custom-gradient {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    border: 0;
    font-size: 0.8rem;
  }

  .custom-gradient legend {
    padding: 0;
    color: var(--muted);
  }

  .gradient-controls {
    display: grid;
    grid-template-columns: auto auto auto auto auto 1fr auto;
    align-items: center;
    gap: 0.35rem;
  }

  .gradient-controls input[type='range'] {
    min-width: 0;
  }

  output {
    min-width: 3ch;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .action {
    width: fit-content;
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    background: var(--surface);
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .action:focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 1px;
  }

  .error {
    margin: 0;
    font-size: 0.72rem;
    color: var(--danger, #f3948f);
  }

  :is(.gradient, .swatch):focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 1px;
  }
</style>
