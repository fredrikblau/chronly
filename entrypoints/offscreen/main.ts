import { browser } from 'wxt/browser'
import { isPlaySoundMessage, isSafeAudioDataUrl, isStopSoundMessage, playPresetLocally, resolveSoundPreset } from '../../lib/core/audio'

const active = new Map<string, { stopped: boolean }>()
const audioElements = new Map<string, HTMLAudioElement>()

browser.runtime.onMessage.addListener((message: unknown) => {
  if (isStopSoundMessage(message)) {
    const playback = active.get(message.playbackId)
    if (playback) playback.stopped = true
    audioElements.get(message.playbackId)?.pause()
    audioElements.delete(message.playbackId)
    return
  }
  if (!isPlaySoundMessage(message)) return

  const playback = { stopped: false }
  active.set(message.playbackId, playback)
  void (async () => {
    do {
      const audioUrl = message.audioDataUrl && isSafeAudioDataUrl(message.audioDataUrl)
        ? message.audioDataUrl
        : resolveSoundPreset(message.soundId).sourceUrl
      if (audioUrl) {
        const audio = new Audio(audioUrl)
        audio.volume = Math.min(Math.max(message.volume, 0), 1)
        audio.loop = message.loop
        audioElements.set(message.playbackId, audio)
        try {
          await audio.play()
          if (message.loop) await new Promise<void>((resolve) => {
            audio.addEventListener('pause', () => resolve(), { once: true })
          })
        } catch {
          // Some valid MIME types are still rejected by a browser's decoder.
          // Keep the alarm audible with the selected built-in tone.
          audio.pause()
          audioElements.delete(message.playbackId)
          await playPresetLocally(message.soundId, message.volume)
        }
      } else {
        await playPresetLocally(message.soundId, message.volume)
      }
    } while (message.loop && !playback.stopped)
    active.delete(message.playbackId)
    audioElements.delete(message.playbackId)
  })()
})
