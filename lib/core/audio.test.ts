import { describe, expect, it } from 'vitest'
import {
  buildPlaySoundMessage,
  buildStopSoundMessage,
  isPlaySoundMessage,
  isSafeAudioDataUrl,
  isStopSoundMessage,
  resolveSoundPreset,
  SOUND_PRESETS,
} from './audio'

describe('resolveSoundPreset', () => {
  it('returns the matching preset', () => {
    expect(resolveSoundPreset('gentle')).toEqual({
      id: 'gentle',
      label: 'Soft sunrise',
      frequency: 523,
      beeps: 3,
      description: 'Quiet, gentle chimes',
      waveform: 'sine',
      sourceUrl: '/sounds/confirmation-2.ogg',
    })
  })

  it('falls back to the first preset for an unknown id', () => {
    expect(resolveSoundPreset('nonexistent')).toEqual(SOUND_PRESETS[0])
  })
})

describe('buildPlaySoundMessage', () => {
  it('builds an offscreen play-sound message', () => {
    expect(buildPlaySoundMessage('chime', 0.5, 'alarm-1', true)).toEqual({
      target: 'offscreen',
      type: 'play-sound',
      soundId: 'chime',
      volume: 0.5,
      playbackId: 'alarm-1',
      loop: true,
    })
  })
})

describe('isPlaySoundMessage', () => {
  it('accepts a message it built itself', () => {
    expect(isPlaySoundMessage(buildPlaySoundMessage('chime', 0.5))).toBe(true)
  })

  it('builds and validates a stop message', () => {
    const message = buildStopSoundMessage('alarm-1')
    expect(message).toEqual({ target: 'offscreen', type: 'stop-sound', playbackId: 'alarm-1' })
    expect(isStopSoundMessage(message)).toBe(true)
  })

  it('accepts safe imported audio data and rejects executable data', () => {
    expect(isSafeAudioDataUrl('data:audio/ogg;base64,AAAA')).toBe(true)
    expect(isSafeAudioDataUrl('data:text/html;base64,AAAA')).toBe(false)
  })

  it.each([
    ['null', null],
    ['a string', 'play-sound'],
    ['another context’s message', { target: 'popup', type: 'play-sound' }],
    ['a wrong type', { target: 'offscreen', type: 'stop-sound', soundId: 'a', volume: 1 }],
    ['a missing volume', { target: 'offscreen', type: 'play-sound', soundId: 'a' }],
    ['a non-numeric volume', { target: 'offscreen', type: 'play-sound', soundId: 'a', volume: '1' }],
    ['a NaN volume', { target: 'offscreen', type: 'play-sound', soundId: 'a', volume: NaN }],
    ['an infinite volume', { target: 'offscreen', type: 'play-sound', soundId: 'a', volume: Infinity }],
    ['a negative volume', { target: 'offscreen', type: 'play-sound', soundId: 'a', volume: -0.1 }],
    ['an over-range volume', { target: 'offscreen', type: 'play-sound', soundId: 'a', volume: 1.1 }],
  ])('rejects %s', (_label, message) => {
    expect(isPlaySoundMessage(message)).toBe(false)
  })
})
