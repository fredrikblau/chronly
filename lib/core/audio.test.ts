import { describe, expect, it } from 'vitest'
import {
  buildPlaySoundMessage,
  isPlaySoundMessage,
  resolveSoundPreset,
  SOUND_PRESETS,
} from './audio'

describe('resolveSoundPreset', () => {
  it('returns the matching preset', () => {
    expect(resolveSoundPreset('gentle')).toEqual({
      id: 'gentle',
      label: 'Gentle chime',
      frequency: 523,
      beeps: 2,
    })
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

describe('isPlaySoundMessage', () => {
  it('accepts a message it built itself', () => {
    expect(isPlaySoundMessage(buildPlaySoundMessage('chime', 0.5))).toBe(true)
  })

  it.each([
    ['null', null],
    ['a string', 'play-sound'],
    ['another context’s message', { target: 'popup', type: 'play-sound' }],
    ['a wrong type', { target: 'offscreen', type: 'stop-sound', soundId: 'a', volume: 1 }],
    ['a missing volume', { target: 'offscreen', type: 'play-sound', soundId: 'a' }],
    ['a non-numeric volume', { target: 'offscreen', type: 'play-sound', soundId: 'a', volume: '1' }],
  ])('rejects %s', (_label, message) => {
    expect(isPlaySoundMessage(message)).toBe(false)
  })
})
