import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const addListener = vi.fn()

vi.mock('wxt/browser', () => ({
  browser: { runtime: { onMessage: { addListener } } },
}))

beforeEach(() => {
  vi.resetModules()
  addListener.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('offscreen audio messages', () => {
  it('ignores a duplicate request while the same playback id is active', async () => {
    const audio = {
      volume: 1,
      loop: false,
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      addEventListener: vi.fn(),
    }
    const AudioMock = vi.fn(function () {
      return audio
    })
    vi.stubGlobal('Audio', AudioMock)
    await import('./main')
    const handleMessage = addListener.mock.calls[0]?.[0] as (message: unknown) => void
    const message = {
      target: 'offscreen',
      type: 'play-sound',
      soundId: 'default',
      volume: 1,
      playbackId: 'alarm-1',
      loop: true,
    }

    handleMessage(message)
    handleMessage(message)

    expect(AudioMock).toHaveBeenCalledTimes(1)
  })

  it('releases a playback id after audio playback fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = {
      volume: 1,
      loop: false,
      play: vi.fn().mockRejectedValue(new Error('decoder unavailable')),
      pause: vi.fn(),
      addEventListener: vi.fn(),
    }
    const AudioMock = vi.fn(function () {
      return audio
    })
    vi.stubGlobal('Audio', AudioMock)
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('audio context unavailable')
      }),
    )
    await import('./main')
    const handleMessage = addListener.mock.calls[0]?.[0] as (message: unknown) => void
    const message = {
      target: 'offscreen',
      type: 'play-sound',
      soundId: 'default',
      volume: 1,
      playbackId: 'alarm-1',
      loop: true,
    }

    handleMessage(message)
    await new Promise((resolve) => setTimeout(resolve, 0))
    handleMessage(message)

    expect(AudioMock).toHaveBeenCalledTimes(2)
  })

  it('reports what it is playing, and stops reporting it once stopped', async () => {
    // Behaves like an <audio> element: pausing fires 'pause', which ends the loop.
    const onPause: Array<() => void> = []
    const audio = {
      volume: 1,
      loop: true,
      paused: true,
      play: vi.fn(async () => {
        audio.paused = false
      }),
      pause: vi.fn(() => {
        audio.paused = true
        onPause.splice(0).forEach((listener) => listener())
      }),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'pause') onPause.push(listener)
      }),
    }
    vi.stubGlobal(
      'Audio',
      vi.fn(function () {
        return audio
      }),
    )
    await import('./main')
    type Handler = (message: unknown, sender: unknown, sendResponse: (status: unknown) => void) => void
    const handleMessage = addListener.mock.calls[0]?.[0] as Handler
    const status = () => {
      let reply: unknown
      handleMessage({ target: 'offscreen', type: 'sound-status' }, {}, (value) => (reply = value))
      return reply
    }

    handleMessage(
      { target: 'offscreen', type: 'play-sound', soundId: 'default', volume: 1, playbackId: 'alarm-1', loop: true },
      {},
      () => undefined,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(status()).toEqual({ active: ['alarm-1'], audible: ['alarm-1'], levels: { 'alarm-1': 1 } })

    handleMessage({ target: 'offscreen', type: 'stop-sound', playbackId: 'alarm-1' }, {}, () => undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(status()).toEqual({ active: [], audible: [], levels: {} })
  })
})
