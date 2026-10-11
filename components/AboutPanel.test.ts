import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup } from '../lib/core/backup'
import { createAlarm } from '../lib/core/scheduler'
import { createExtensionStorageBackend, RecordStore, SettingsStore, WorldClockStore } from '../lib/core/storage'
import { DEFAULT_SETTINGS } from '../lib/core/types'
import AboutPanel from './AboutPanel.svelte'

describe('AboutPanel', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  it('links to the project for stars, bug reports and contributions', () => {
    render(AboutPanel)

    expect(screen.getByRole('link', { name: /Star on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/fredrikblau/chronly',
    )
    expect(screen.getByRole('link', { name: /Report a problem/ })).toHaveAttribute('target', '_blank')
  })

  it('exports a backup file', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chronly-test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(AboutPanel)
    await fireEvent.click(screen.getByRole('button', { name: /Export/ }))

    const backup = JSON.parse(await (createObjectURL.mock.calls[0]?.[0] as Blob).text())
    expect(backup).toMatchObject({ app: 'chronly', version: 1 })
    expect(screen.getByRole('status')).toHaveTextContent('Exported')
  })

  it('imports a backup and reports what it added', async () => {
    const alarm = createAlarm('Imported alarm', new Date(2026, 1, 2, 7, 0).getTime(), 0)
    const backup = createBackup(
      {
        settings: { ...DEFAULT_SETTINGS, hour12: true },
        worldClocks: [{ id: 'x', timeZone: 'Asia/Tokyo', label: 'Tokyo', color: '#ff0000', order: 0 }],
        alarms: [alarm],
      },
      Date.now(),
    )
    render(AboutPanel)

    const file = new File([JSON.stringify(backup)], 'chronly-backup.json', { type: 'application/json' })
    await fireEvent.change(screen.getByLabelText('Import a Chronly backup file'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Imported 1 alarms and 1 world clocks'))
    expect((await new SettingsStore(createExtensionStorageBackend('sync')).get()).hour12).toBe(true)
    expect(await new WorldClockStore(createExtensionStorageBackend('sync')).getAll()).toHaveLength(1)
    const alarms = await new RecordStore(createExtensionStorageBackend('local')).getAll()
    expect(alarms.map((r) => r.label)).toEqual(['Imported alarm'])
  })

  it('rejects a file that is not a backup', async () => {
    render(AboutPanel)

    const file = new File(['hello'], 'notes.json', { type: 'application/json' })
    await fireEvent.change(screen.getByLabelText('Import a Chronly backup file'), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('not a Chronly backup')
  })
})
