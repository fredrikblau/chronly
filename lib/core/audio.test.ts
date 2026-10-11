import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPlaySoundMessage,
  buildStopSoundMessage,
  FADE_IN_MS,
  fadeIn,
  isPlaySoundMessage,
  isSafeAudioDataUrl,
  isSoundStatusMessage,
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
      fadeInMs: 0,
    })
  })

  it('carries a gentle-wake fade', () => {
    const message = buildPlaySoundMessage('chime', 0.5, 'alarm-1', true, undefined, FADE_IN_MS)
    expect(message.fadeInMs).toBe(30_000)
    expect(isPlaySoundMessage(message)).toBe(true)
  })
})

describe('fadeIn', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets full volume at once when there is no fade', () => {
    const audio = { volume: 0 }
    fadeIn(audio, 0.8, 0)
    expect(audio.volume).toBe(0.8)
  })

  it('starts quiet and rises steadily to the set volume', () => {
    vi.useFakeTimers()
    const audio = { volume: 1 }
    fadeIn(audio, 0.8, 30_000)
    expect(audio.volume).toBeCloseTo(0.05)

    vi.advanceTimersByTime(15_000)
    expect(audio.volume).toBeCloseTo(0.425)

    vi.advanceTimersByTime(15_000)
    expect(audio.volume).toBeCloseTo(0.8)
    vi.advanceTimersByTime(10_000)
    expect(audio.volume).toBeCloseTo(0.8)
  })

  it('never starts louder than the set volume', () => {
    const audio = { volume: 1 }
    fadeIn(audio, 0.02, 30_000)
    expect(audio.volume).toBe(0.02)
  })

  it('stops rising once stopped', () => {
    vi.useFakeTimers()
    const audio = { volume: 0 }
    const stop = fadeIn(audio, 1, 10_000)
    vi.advanceTimersByTime(2_000)
    const reached = audio.volume
    stop()
    vi.advanceTimersByTime(10_000)
    expect(audio.volume).toBe(reached)
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
    [
      'a negative fade',
      { target: 'offscreen', type: 'play-sound', soundId: 'a', volume: 1, playbackId: 'p', loop: true, fadeInMs: -1 },
    ],
  ])('rejects %s', (_label, message) => {
    expect(isPlaySoundMessage(message)).toBe(false)
  })
})

describe('isSoundStatusMessage', () => {
  it('recognises a status request and nothing else', () => {
    expect(isSoundStatusMessage({ target: 'offscreen', type: 'sound-status' })).toBe(true)
    expect(isSoundStatusMessage({ target: 'offscreen', type: 'stop-sound', playbackId: 'a' })).toBe(false)
    expect(isSoundStatusMessage(null)).toBe(false)
  })
})
