<script lang="ts">
  import { SOUND_PRESETS, playAlarmSound } from '../lib/core/audio'
  import type { CustomSound } from '../lib/core/types'
  import { customSounds, soundActions } from '../lib/ui/sounds'
  import Icon from './Icon.svelte'

  let { soundId = $bindable('default'), volume = $bindable(0.8) } = $props<{
    soundId?: string
    volume?: number
  }>()

  let fileInput: HTMLInputElement
  let error = $state('')
  let pendingSounds = $state<CustomSound[]>([])
  let removing = $state(false)

  const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i

  const allCustomSounds = $derived(
    [...$customSounds, ...pendingSounds].filter(
      (sound, index, list) => list.findIndex((candidate) => candidate.id === sound.id) === index,
    ),
  )

  function test() {
    error = ''
    void playAlarmSound(
      soundId,
      volume,
      'preview',
      false,
      allCustomSounds.find((sound) => sound.id === soundId)?.dataUrl,
    ).catch(() => {
      error = 'Could not play that sound. Try another sound or check audio access.'
    })
  }

  function importSound() {
    const file = fileInput.files?.[0]
    if (!file) return
    error = ''
    if (!file.type.startsWith('audio/') && !AUDIO_EXTENSIONS.test(file.name)) {
      error = 'Choose an audio file.'
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      error = 'Audio files must be 5 MB or smaller.'
      return
    }
    const reader = new FileReader()
    reader.onerror = () => {
      error = 'Could not read that audio file. Try another file.'
    }
    reader.onload = async () => {
      if (typeof reader.result !== 'string') {
        error = 'Could not read that audio file. Try another file.'
        return
      }
      const sound: CustomSound = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name.replace(/\.[^.]+$/, '') || 'Imported sound',
        dataUrl: reader.result,
        mimeType: file.type || 'audio/mpeg',
        createdAt: Date.now(),
      }
      try {
        await soundActions.upsert(sound)
        pendingSounds = [...pendingSounds, sound]
        soundId = sound.id
      } catch {
        error = 'Could not save that sound. Check the extension storage and try again.'
      }
    }
    reader.readAsDataURL(file)
    fileInput.value = ''
  }

  async function removeSelected() {
    if (!soundId.startsWith('custom-') || removing) return
    const fallback = SOUND_PRESETS[0].id
    const removedId = soundId
    error = ''
    removing = true
    try {
      await soundActions.remove(removedId)
      pendingSounds = pendingSounds.filter((sound) => sound.id !== removedId)
      if (soundId === removedId) soundId = fallback
    } catch {
      error = 'Could not remove that sound. Check the extension storage and try again.'
    } finally {
      removing = false
    }
  }
</script>

<div class="sound-picker">
  <div class="sound-line">
    <select class="input" aria-label="Sound" bind:value={soundId}>
      <optgroup label="Built-in">
        {#each SOUND_PRESETS as sound (sound.id)}
          <option value={sound.id}>{sound.label} — {sound.description}</option>
        {/each}
      </optgroup>
      {#if allCustomSounds.length}
        <optgroup label="Imported">
          {#each allCustomSounds as sound (sound.id)}
            <option value={sound.id}>{sound.name}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
    <button type="button" class="icon-btn boxed" title="Play" aria-label="Play selected sound" onclick={test}>
      <Icon name="play" size={14} />
    </button>
  </div>
  <div class="sound-line">
    <label class="volume">
      <Icon name="volume" size={16} />
      <input type="range" min="0" max="1" step="0.05" aria-label="Volume" bind:value={volume} />
      <output>{Math.round(volume * 100)}%</output>
    </label>
    <div class="sound-actions">
      {#if soundId.startsWith('custom-')}
        <button type="button" class="btn btn-quiet btn-sm btn-danger" disabled={removing} onclick={removeSelected}>
          {removing ? 'Removing…' : 'Remove'}
        </button>
      {/if}
      <button
        type="button"
        class="btn btn-quiet btn-sm"
        title="MP3, WAV, OGG, M4A, AAC, FLAC or WebM, up to 5 MB"
        onclick={() => fileInput.click()}
      >
        <Icon name="upload" size={13} /> Import
      </button>
    </div>
    <input
      bind:this={fileInput}
      class="file-input"
      type="file"
      tabindex="-1"
      aria-label="Import an audio file"
      accept="audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm"
      onchange={importSound}
    />
  </div>
  {#if error}<p class="error-text" role="alert">{error}</p>{/if}
</div>

<style>
  .sound-picker {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .sound-line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  select {
    flex: 1 1 auto;
    width: 100%;
  }

  .icon-btn {
    width: 2.125rem;
    height: 2.125rem;
  }

  .volume {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    color: var(--fg-muted);
    font-size: 0.75rem;
  }

  .volume input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .volume output {
    min-width: 3.2ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .sound-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.1rem;
  }

  /* The picker is a styled button; the native control stays in the DOM, out of
     sight, so the file dialog and drag-and-drop testing hooks keep working. */
  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    opacity: 0;
  }
</style>
