import { describe, expect, it } from 'vitest'
import { buildPlaySoundMessage, resolveSoundPreset, SOUND_PRESETS } from './audio'

describe('resolveSoundPreset', () => {
  it('returns the matching preset', () => {
    expect(resolveSoundPreset('gentle')).toEqual(SOUND_PRESETS.find((p) => p.id === 'gentle'))
  })

  it('falls back to the first preset for an unknown id', () => {
    expect(resolveSoundPreset('nonexistent')).toEqual(SOUND_PRESETS[0])
  })
})

describe('buildPlaySoundMessage', () => {
  it('builds an offscreen play-sound message', () => {
    expect(buildPlaySoundMessage('chime', 0.5)).toEqual({
      target: 'offscreen',
      type: 'play-sound',
      soundId: 'chime',
      volume: 0.5,
    })
  })
})
