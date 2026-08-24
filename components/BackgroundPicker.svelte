<script lang="ts">
  import { DEFAULT_SETTINGS, LOCAL_BACKGROUND_IMAGE_VALUE } from '../lib/core/types'
  import { backgroundImage, backgroundImageActions } from '../lib/ui/backgroundImage'
  import type { BackgroundConfig } from '../lib/core/types'
  import { accentFromCss, accentFromLocalImage, isSafeImageUrl } from '../lib/ui/palette'
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
  const localImage = $derived($backgroundImage ?? '')
  const solidValue = $derived(background.type === 'solid' ? background.value : DEFAULT_SETTINGS.background.value)
  const imageValue = $derived(
    background.type === 'image' && background.value !== LOCAL_BACKGROUND_IMAGE_VALUE ? background.value : '',
  )

  function apply(patch: Partial<BackgroundConfig>) {
    void settingsActions.update({ background: { ...background, ...patch } })
  }

  function setSolid(color: string) {
    error = null
    void backgroundImageActions.clear()
    apply({ type: 'solid', value: color })
  }

  function setGradient(value: string) {
    error = null
    void backgroundImageActions.clear()
    apply({ type: 'gradient', value })
  }

  function setAccent(color: string) {
    apply({ accentColor: color })
  }

  function applyCustomGradient() {
    error = null
    void backgroundImageActions.clear()
    apply({ type: 'gradient', value: `linear-gradient(${customAngle}deg, ${customStart}, ${customEnd})` })
  }

  async function extractAccent() {
    const extracted =
      background.type === 'image'
        ? await accentFromLocalImage(background.value === LOCAL_BACKGROUND_IMAGE_VALUE ? localImage : background.value)
        : accentFromCss(background.value)
    if (!extracted) {
      error = 'Accent extraction is available for solid, gradient, and uploaded images.'
      return
    }
    error = null
    apply({ accentColor: extracted })
  }

  function setImage(raw: string) {
    const url = raw.trim()
    if (url === '') {
      // Emptying the field is how an image is removed; falling back to the
      // default surface keeps the page readable instead of leaving `url()`.
      error = null
      void backgroundImageActions.clear()
      apply({ type: 'solid', value: DEFAULT_SETTINGS.background.value })
      return
    }
    if (!isSafeImageUrl(url)) {
      error = 'Enter an https://, http://, or data: image URL without CSS-breaking characters.'
      return
    }
    error = null
    void backgroundImageActions.clear()
    apply({ type: 'image', value: url })
  }

  function setImageFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!isSafeImageUrl(dataUrl)) {
        error = 'Choose a raster image such as PNG, JPEG, GIF, WebP, or AVIF.'
        return
      }
      error = null
      void backgroundImageActions
        .set(dataUrl)
        .then(() => apply({ type: 'image', value: LOCAL_BACKGROUND_IMAGE_VALUE }))
        .catch(() => {
          error = 'The image could not be stored locally.'
        })
    }
    reader.onerror = () => {
      error = 'The image could not be read.'
    }
    reader.readAsDataURL(file)
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
      oninput={(e) => setSolid(e.currentTarget.value)}
    />
    <label for="chronly-bg-accent">Accent colour</label>
    <input
      id="chronly-bg-accent"
      class="swatch"
      type="color"
      value={background.accentColor}
      oninput={(e) => setAccent(e.currentTarget.value)}
    />
    <label for="chronly-bg-upload">Upload image</label>
    <input
      id="chronly-bg-upload"
      class="field"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon"
      onchange={(e) => setImageFile(e.currentTarget.files?.[0])}
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

  <div class="image">
    <label for="chronly-bg-image">Image URL</label>
    <input
      id="chronly-bg-image"
      class="field"
      type="url"
      inputmode="url"
      autocomplete="off"
      placeholder="https://example.com/photo.jpg"
      value={imageValue}
      onchange={(e) => setImage(e.currentTarget.value)}
    />
  </div>

  <button type="button" class="action" onclick={extractAccent}>Auto-pick accent from background</button>

  <!--
    Said plainly because the two surfaces treat this differently on purpose: the
    dashboard is a canvas, the popup is a dense control panel that only takes a
    background on when the theme can be read over it.
  -->
  <p class="note">The New Tab dashboard always uses this; the popup follows when it suits the theme.</p>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if background.type === 'image' && (background.value === LOCAL_BACKGROUND_IMAGE_VALUE || background.value.startsWith('data:'))}
    <p class="note">This image is stored locally in Chronly and is not fetched from a host.</p>
  {:else if background.type === 'image'}
    <!--
      The image is fetched by the browser on every New Tab paint, which tells
      whoever hosts it that the tab was opened. Worth saying out loud in an
      extension whose pitch is that it keeps to itself.
    -->
    <p class="note">This image is loaded from its host each time a new tab opens.</p>
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

  .image {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
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

  .field {
    font: inherit;
    font-size: 0.8rem;
    color: inherit;
    background: var(--field, rgba(0, 0, 0, 0.35));
    border: 1px solid var(--border);
    border-radius: 0.45rem;
    padding: 0.35rem 0.5rem;
    min-width: 0;
  }

  .field::placeholder {
    color: var(--fg-faint, rgba(245, 245, 247, 0.35));
  }

  .error {
    margin: 0;
    font-size: 0.72rem;
    color: var(--danger, #f3948f);
  }

  .note {
    margin: 0;
    font-size: 0.7rem;
    color: var(--muted);
  }

  :is(.field, .gradient, .swatch):focus-visible {
    outline: 2px solid var(--accent, #8b7cf6);
    outline-offset: 1px;
  }
</style>
