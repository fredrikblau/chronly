import { browser } from 'wxt/browser'
import { isPlaySoundMessage, playPresetLocally } from '../../lib/core/audio'

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isPlaySoundMessage(message)) return
  void playPresetLocally(message.soundId, message.volume)
})
