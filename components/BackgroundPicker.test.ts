import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { BackgroundImageStore, createExtensionStorageBackend, SettingsStore } from '../lib/core/storage'
import { LOCAL_BACKGROUND_IMAGE_VALUE } from '../lib/core/types'
import type { BackgroundConfig, Settings } from '../lib/core/types'
import BackgroundPicker from './BackgroundPicker.svelte'

const readSettings = () => new SettingsStore(createExtensionStorageBackend('sync')).get()

async function seed(patch: Partial<Settings>): Promise<void> {
  await new SettingsStore(createExtensionStorageBackend('sync')).update(patch)
}

// settingsActions.update() is fire-and-forget from the event handler, so the
// write lands a few microtasks after the event that triggered it.
async function expectBackground(expected: Partial<BackgroundConfig>): Promise<void> {
  await waitFor(async () => {
    expect((await readSettings()).background).toMatchObject(expected)
  })
}

const imageInput = () => screen.getByPlaceholderText('https://example.com/photo.jpg')

const SUNSET = 'linear-gradient(135deg, #ff7e5f, #feb47b)'

describe('BackgroundPicker', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('applies a gradient preset', async () => {
    render(BackgroundPicker)

    await fireEvent.click(await screen.findByRole('button', { name: 'Sunset' }))

    await expectBackground({ type: 'gradient' })
    expect((await readSettings()).background.value).toContain('#ff7e5f')
  })

  it('marks the selected gradient as pressed', async () => {
    render(BackgroundPicker)

    await fireEvent.click(await screen.findByRole('button', { name: 'Aurora' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Aurora' })).toHaveAttribute('aria-pressed', 'true')
    })
    expect(screen.getByRole('button', { name: 'Sunset' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies a custom gradient from the builder', async () => {
    render(BackgroundPicker)

    await fireEvent.input(screen.getByLabelText('Start'), { target: { value: '#112233' } })
    await fireEvent.input(screen.getByLabelText('End'), { target: { value: '#aabbcc' } })
    await fireEvent.input(screen.getByLabelText('Angle'), { target: { value: '45' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Apply custom gradient' }))

    await expectBackground({ type: 'gradient', value: 'linear-gradient(45deg, #112233, #aabbcc)' })
  })

  it('sets a solid colour', async () => {
    render(BackgroundPicker)

    await fireEvent.input(screen.getByLabelText('Solid colour'), { target: { value: '#123456' } })

    await expectBackground({ type: 'solid', value: '#123456' })
  })

  it('sets the accent colour without disturbing the background type', async () => {
    await seed({ background: { type: 'gradient', value: SUNSET, accentColor: '#8b7cf6' } })
    render(BackgroundPicker)

    // The settings store is module-level: a fresh subscriber is handed the last
    // cached value before its storage read resolves, so the seeded state has to
    // be on screen before the component can act on it.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sunset' })).toHaveAttribute('aria-pressed', 'true')
    })
    await fireEvent.input(screen.getByLabelText('Accent colour'), { target: { value: '#00ff00' } })

    await expectBackground({ type: 'gradient', value: SUNSET, accentColor: '#00ff00' })
  })

  it('can auto-pick an accent from a CSS background', async () => {
    await seed({ background: { type: 'solid', value: '#123456', accentColor: '#8b7cf6' } })
    render(BackgroundPicker)

    await waitFor(() => {
      expect(screen.getByLabelText('Solid colour')).toHaveValue('#123456')
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Auto-pick accent from background' }))

    await waitFor(async () => {
      expect((await readSettings()).background.accentColor).toBe('#123456')
    })
  })

  it('sets an image URL', async () => {
    render(BackgroundPicker)

    await fireEvent.change(imageInput(), { target: { value: 'https://example.com/bg.jpg' } })

    await expectBackground({ type: 'image', value: 'https://example.com/bg.jpg' })
  })

  it('stores a pasted raster data URL locally instead of syncing its bytes', async () => {
    render(BackgroundPicker)

    await fireEvent.change(imageInput(), { target: { value: 'data:image/png;base64,AAAA' } })

    await waitFor(async () => {
      expect((await readSettings()).background.value).toBe(LOCAL_BACKGROUND_IMAGE_VALUE)
      expect(await new BackgroundImageStore(createExtensionStorageBackend('local')).get()).toBe(
        'data:image/png;base64,AAAA',
      )
    })
  })

  it('stores an uploaded raster image as a local data URL', async () => {
    render(BackgroundPicker)
    const file = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'wallpaper.png', {
      type: 'image/png',
    })

    await fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } })

    await waitFor(async () => {
      const stored = (await readSettings()).background
      expect(stored.type).toBe('image')
      expect(stored.value).toBe(LOCAL_BACKGROUND_IMAGE_VALUE)
      expect(await new BackgroundImageStore(createExtensionStorageBackend('local')).get()).toMatch(
        /^data:image\/png;base64,/,
      )
    })
  })

  it('rejects an uploaded SVG image', async () => {
    render(BackgroundPicker)
    const file = new File(['<svg></svg>'], 'unsafe.svg', { type: 'image/svg+xml' })

    await fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/raster image/i)
    expect((await readSettings()).background.type).toBe('solid')
  })

  it('rejects SVG content with a forged raster MIME type', async () => {
    render(BackgroundPicker)
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'unsafe.png', { type: 'image/png' })

    await fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/raster image/i)
    expect((await readSettings()).background.type).toBe('solid')
  })

  it('rejects a URL that is not http(s) or a data URI', async () => {
    render(BackgroundPicker)

    await fireEvent.change(imageInput(), { target: { value: 'javascript:alert(1)' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/https/i)
    expect((await readSettings()).background.type).toBe('solid')
  })

  // The New Tab dashboard interpolates the stored value into `url(...)`, so a
  // value carrying a closing parenthesis could escape the function and inject
  // arbitrary CSS declarations.
  it('rejects a URL that could break out of the css url() it is placed in', async () => {
    render(BackgroundPicker)

    await fireEvent.change(imageInput(), { target: { value: 'https://example.com/a.jpg);color:red;--x:url(b' } })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect((await readSettings()).background.type).toBe('solid')
  })

  it('clears back to a solid background when the image URL is emptied', async () => {
    await seed({ background: { type: 'image', value: 'https://example.com/a.jpg', accentColor: '#8b7cf6' } })
    render(BackgroundPicker)

    await waitFor(() => {
      expect(imageInput()).toHaveValue('https://example.com/a.jpg')
    })
    await fireEvent.change(imageInput(), { target: { value: '  ' } })

    await expectBackground({ type: 'solid' })
  })

  it('leaves the image field empty when the background is not an image', async () => {
    await seed({ background: { type: 'gradient', value: 'linear-gradient(#000, #fff)', accentColor: '#8b7cf6' } })
    render(BackgroundPicker)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sunset' })).toBeInTheDocument()
    })
    expect(imageInput()).toHaveValue('')
  })
})
