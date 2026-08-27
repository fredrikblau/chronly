import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { createExtensionStorageBackend, CustomSoundStore } from '../lib/core/storage'
import SoundPicker from './SoundPicker.svelte'

describe('SoundPicker', () => {
  beforeEach(() => fakeBrowser.reset())

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
})
