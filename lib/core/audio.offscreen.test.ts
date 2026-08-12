import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Chrome branch of playAlarmSound needs `offscreen` to be present on the
// browser object and `runtime.getContexts` to exist; fake-browser models
// neither, so this file drives a purpose-built mock. Kept separate from
// audio.test.ts because vi.mock applies to the whole module graph of a file.
const createDocument = vi.fn<() => Promise<void>>()
const getContexts = vi.fn<() => Promise<unknown[]>>()
const sendMessage = vi.fn<() => Promise<void>>()

vi.mock('wxt/browser', () => ({
  browser: {
    offscreen: { createDocument: () => createDocument() },
    runtime: {
      getContexts: () => getContexts(),
      sendMessage: () => sendMessage(),
    },
  },
}))

const { playAlarmSound } = await import('./audio')

describe('playAlarmSound on Chrome', () => {
  beforeEach(() => {
    createDocument.mockReset().mockResolvedValue(undefined)
    getContexts.mockReset().mockResolvedValue([])
    sendMessage.mockReset().mockResolvedValue(undefined)
  })

  it('creates the offscreen document once when two records fire in the same tick', async () => {
    await Promise.all([playAlarmSound('default', 1), playAlarmSound('gentle', 1)])
    expect(createDocument).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('does not create a document when one already exists', async () => {
    getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    await playAlarmSound('default', 1)
    expect(createDocument).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('creates again on a later call once the first creation has settled', async () => {
    await playAlarmSound('default', 1)
    await playAlarmSound('default', 1)
    // getContexts still reports empty, so the shared promise must have been
    // released rather than latching the first result forever.
    expect(createDocument).toHaveBeenCalledTimes(2)
  })

  it('still sends the sound when createDocument rejects as a duplicate', async () => {
    createDocument.mockRejectedValue(new Error('Only a single offscreen document may be created.'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(playAlarmSound('default', 1)).resolves.toBeUndefined()
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('never rejects when the message cannot be delivered', async () => {
    sendMessage.mockRejectedValue(new Error('Could not establish connection.'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(playAlarmSound('default', 1)).resolves.toBeUndefined()
    expect(sendMessage).toHaveBeenCalledTimes(2) // one retry
  })
})
