import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExtensionStorageBackend, CustomSoundStore } from '../lib/core/storage'
import { soundActions } from '../lib/ui/sounds'
import SoundPicker from './SoundPicker.svelte'

describe('SoundPicker', () => {
  beforeEach(() => fakeBrowser.reset())
  afterEach(() => vi.restoreAllMocks())

  it('imports an audio file and selects it', async () => {
    render(SoundPicker)
    const file = new File(['audio bytes'], 'morning-bell.ogg', { type: 'audio/ogg' })
    await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('option', { name: /morning-bell/i })).toBeInTheDocument())
    await waitFor(async () => {
      expect(await new CustomSoundStore(createExtensionStorageBackend('local')).getAll()).toHaveLength(1)
    })
  })

  it('accepts an audio extension when the browser omits the MIME type', async () => {
    render(SoundPicker)
    const file = new File(['audio bytes'], 'voice-note.m4a', { type: '' })
    await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    expect(await screen.findByRole('option', { name: /voice-note/i })).toBeInTheDocument()
  })

  it('shows an imported sound only after extension storage accepts it', async () => {
    let finishWrite = () => {}
    vi.spyOn(soundActions, 'upsert').mockImplementation(() => new Promise<void>((resolve) => (finishWrite = resolve)))
    render(SoundPicker)
    const file = new File(['audio bytes'], 'slow-save.ogg', { type: 'audio/ogg' })
    await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    await waitFor(() => expect(soundActions.upsert).toHaveBeenCalled())

    expect(screen.queryByRole('option', { name: /slow-save/i })).not.toBeInTheDocument()
    finishWrite()
    expect(await screen.findByRole('option', { name: /slow-save/i })).toBeInTheDocument()
  })

  it('keeps the selected sound when removal fails', async () => {
    const sound = {
      id: 'custom-1',
      name: 'Bell',
      dataUrl: 'data:audio/ogg;base64,AAAA',
      mimeType: 'audio/ogg',
      createdAt: 1,
    }
    await new CustomSoundStore(createExtensionStorageBackend('local')).upsert(sound)
    let rejectRemoval: (reason?: unknown) => void = () => undefined
    vi.spyOn(soundActions, 'remove').mockImplementation(() => {
      const removal = new Promise<void>((_resolve, reject) => (rejectRemoval = reject))
      void removal.catch(() => undefined)
      return removal
    })
    render(SoundPicker, { soundId: sound.id })
    await screen.findByRole('option', { name: /Bell/i })

    await fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled()
    rejectRemoval(new Error('storage unavailable'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove')
    expect(screen.getByRole('combobox', { name: 'Sound' })).toHaveValue(sound.id)
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
  })
})
