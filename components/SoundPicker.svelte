<script lang="ts">
  import { SOUND_PRESETS, playAlarmSound } from '../lib/core/audio'
  import type { CustomSound } from '../lib/core/types'
  import { customSounds, soundActions } from '../lib/ui/sounds'

  let { soundId = $bindable('default'), volume = $bindable(0.8) } = $props<{
    soundId?: string
    volume?: number
  }>()

  let fileInput: HTMLInputElement
  let error = $state('')
  let pendingSounds = $state<CustomSound[]>([])

  const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i

  const allCustomSounds = $derived(
    [...$customSounds, ...pendingSounds].filter(
      (sound, index, list) => list.findIndex((candidate) => candidate.id === sound.id) === index,
    ),
  )

  const sounds = $derived([
    ...SOUND_PRESETS.map((sound) => ({ id: sound.id, label: sound.label, detail: sound.description })),
    ...allCustomSounds.map((sound) => ({ id: sound.id, label: sound.name, detail: 'Imported audio' })),
  ])

  function test() {
    void playAlarmSound(soundId, volume, 'preview', false, allCustomSounds.find((sound) => sound.id === soundId)?.dataUrl)
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
      pendingSounds = [...pendingSounds, sound]
      soundId = sound.id
      try {
        await soundActions.upsert(sound)
      } catch {
        pendingSounds = pendingSounds.filter((candidate) => candidate.id !== sound.id)
        soundId = SOUND_PRESETS[0].id
        error = 'Could not save that sound. Check the extension storage and try again.'
      }
    }
    reader.readAsDataURL(file)
    fileInput.value = ''
  }

  function removeSelected() {
    if (!soundId.startsWith('custom-')) return
    const fallback = SOUND_PRESETS[0].id
    const removedId = soundId
    pendingSounds = pendingSounds.filter((sound) => sound.id !== removedId)
    void soundActions.remove(removedId)
    soundId = fallback
  }
</script>

<div class="sound-picker">
  <div class="sound-line">
    <select aria-label="Sound" bind:value={soundId}>
      {#each sounds as sound (sound.id)}
        <option value={sound.id}>{sound.label} — {sound.detail}</option>
      {/each}
    </select>
    <button type="button" class="icon" aria-label="Play selected sound" onclick={test}>▶</button>
  </div>
  <div class="sound-actions">
    <button type="button" class="link" onclick={() => fileInput.click()}>Import audio</button>
    {#if soundId.startsWith('custom-')}
      <button type="button" class="link danger" onclick={removeSelected}>Remove</button>
    {/if}
    <input
      bind:this={fileInput}
      class="file-input"
      type="file"
      accept="audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm"
      onchange={importSound}
    />
  </div>
  <label class="volume">
    <span>Volume</span>
    <input type="range" min="0" max="1" step="0.05" aria-label="Volume" bind:value={volume} />
    <output>{Math.round(volume * 100)}%</output>
  </label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .sound-picker { display: grid; gap: 0.35rem; }
  .sound-line { display: grid; grid-template-columns: 1fr auto; gap: 0.35rem; }
  select, button { font: inherit; }
  select { min-width: 0; padding: 0.45rem; border: 1px solid var(--line, rgba(255,255,255,.12)); border-radius: .45rem; background: var(--field, rgba(0,0,0,.2)); color: inherit; }
  .icon { width: 2rem; border: 1px solid var(--line, rgba(255,255,255,.12)); border-radius: .45rem; background: var(--tint, rgba(255,255,255,.05)); color: inherit; cursor: pointer; }
  .sound-actions { display: flex; gap: .7rem; align-items: center; }
  .link { padding: 0; border: 0; background: none; color: var(--accent-ink, var(--accent, #8b7cf6)); font-size: .72rem; cursor: pointer; }
  .danger { color: var(--danger, #fca5a5); }
  .file-input { width: 100%; color: var(--muted, rgba(255,255,255,.6)); font-size: .7rem; }
  .error { margin: 0; color: var(--danger, #fca5a5); font-size: .72rem; }
  .volume { display: grid; grid-template-columns: auto 1fr auto; gap: .5rem; align-items: center; color: var(--muted, rgba(255,255,255,.6)); font-size: .72rem; }
  .volume input { min-width: 0; width: 100%; accent-color: var(--accent, #8b7cf6); }
  .volume output { min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums; }
</style>
