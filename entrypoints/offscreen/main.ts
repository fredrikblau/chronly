import { browser } from 'wxt/browser'
import { playPresetLocally } from '../../lib/core/audio'
import type { PlaySoundMessage } from '../../lib/core/audio'

browser.runtime.onMessage.addListener((message: PlaySoundMessage) => {
  if (message?.target !== 'offscreen' || message?.type !== 'play-sound') return
  void playPresetLocally(message.soundId, message.volume)
})
