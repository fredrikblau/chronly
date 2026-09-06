import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('wxt/browser', () => ({ browser: {} }))

const { playAlarmSound, stopAlarmSound } = await import('./audio')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playAlarmSound without Chrome offscreen support', () => {
  it('ignores a duplicate request while the same playback id is active', async () => {
    let onPause = () => {}
    const audio = {
      volume: 1,
      loop: false,
      play: vi.fn(async () => {}),
      pause: vi.fn(() => onPause()),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'pause') onPause = listener
      }),
    }
    const AudioMock = vi.fn(function () {
      return audio
    })
    vi.stubGlobal('Audio', AudioMock)

    const first = playAlarmSound('default', 1, 'alarm-1', true)
    await vi.waitFor(() => expect(audio.addEventListener).toHaveBeenCalled())
    await playAlarmSound('gentle', 1, 'alarm-1', true)

    expect(AudioMock).toHaveBeenCalledTimes(1)
    await stopAlarmSound('alarm-1')
    await first
  })
})
