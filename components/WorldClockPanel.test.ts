import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import { createExtensionStorageBackend, WorldClockStore } from '../lib/core/storage'
import type { WorldClockEntry } from '../lib/core/types'
import WorldClockPanel from './WorldClockPanel.svelte'

const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

// Upserts are read-modify-write on one storage key, so they must be sequential.
async function seed(...entries: Partial<WorldClockEntry>[]): Promise<void> {
  const store = new WorldClockStore(createExtensionStorageBackend('sync'))
  for (const [index, entry] of entries.entries()) {
    await store.upsert({
      id: `wc-${index}`,
      timeZone: 'UTC',
      label: `Zone ${index}`,
      color: '#8b7cf6',
      order: index,
      ...entry,
    })
  }
}

const zoneInput = () => screen.getByPlaceholderText('Time zone (e.g. Asia/Tokyo)')
const labelInput = () => screen.getByPlaceholderText('Label')
const addButton = () => screen.getByRole('button', { name: 'Add' })
function row(index: number): HTMLElement {
  const found = screen.getAllByRole('listitem')[index]
  if (!found) throw new Error(`no world clock row at index ${index}`)
  return found
}

describe('WorldClockPanel', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('lists an existing world clock entry', async () => {
    await seed({ id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo' })

    render(WorldClockPanel)

    expect(await screen.findByText('Tokyo')).toBeInTheDocument()
  })

  it('shows the zone name and its UTC offset for each entry', async () => {
    await seed({ id: 'utc', timeZone: 'UTC', label: 'Coordinated' })

    render(WorldClockPanel)

    await screen.findByText('Coordinated')
    expect(within(row(0)).getByText('UTC')).toBeInTheDocument()
    expect(within(row(0)).getByText('UTC+0')).toBeInTheDocument()
  })

  it('shows a zero difference and same day for an entry in the local zone', async () => {
    await seed({ id: 'home', timeZone: LOCAL_ZONE, label: 'Home' })

    render(WorldClockPanel)

    await screen.findByText('Home')
    expect(within(row(0)).getByText('+0h, today')).toBeInTheDocument()
  })

  it('adds a new zone from the form', async () => {
    render(WorldClockPanel)

    await fireEvent.input(zoneInput(), { target: { value: 'Europe/Paris' } })
    await fireEvent.input(labelInput(), { target: { value: 'Paris' } })
    await fireEvent.click(addButton())

    expect(await screen.findByText('Paris')).toBeInTheDocument()
  })

  it('falls back to the city part of the zone when no label is typed', async () => {
    render(WorldClockPanel)

    await fireEvent.input(zoneInput(), { target: { value: 'America/New_York' } })
    await fireEvent.click(addButton())

    expect(await screen.findByText('New York')).toBeInTheDocument()
  })

  it('does not add a duplicate zone', async () => {
    await seed({ id: 'paris', timeZone: 'Europe/Paris', label: 'Paris' })

    render(WorldClockPanel)
    await screen.findByText('Paris')

    await fireEvent.input(zoneInput(), { target: { value: 'Europe/Paris' } })
    await fireEvent.click(addButton())

    expect(screen.getAllByText('Paris')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('already')
  })

  it('rejects a zone the runtime does not recognise', async () => {
    render(WorldClockPanel)

    await fireEvent.input(zoneInput(), { target: { value: 'Middle/Earth' } })
    await fireEvent.click(addButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Middle/Earth')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('removes an entry', async () => {
    await seed({ id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo' })

    render(WorldClockPanel)
    await screen.findByText('Tokyo')

    await fireEvent.click(screen.getByRole('button', { name: 'Remove Tokyo' }))

    await waitFor(() => expect(screen.queryByText('Tokyo')).toBeNull())
  })

  it('reorders entries with the move buttons', async () => {
    await seed(
      { id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo' },
      { id: 'paris', timeZone: 'Europe/Paris', label: 'Paris' },
    )

    render(WorldClockPanel)
    await waitFor(() => expect(within(row(0)).getByText('Tokyo')).toBeInTheDocument())

    await fireEvent.click(screen.getByRole('button', { name: 'Move Paris up' }))

    await waitFor(() => expect(within(row(0)).getByText('Paris')).toBeInTheDocument())
    expect(within(row(1)).getByText('Tokyo')).toBeInTheDocument()
  })

  it('disables the move buttons at the ends of the list', async () => {
    await seed(
      { id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo' },
      { id: 'paris', timeZone: 'Europe/Paris', label: 'Paris' },
    )

    render(WorldClockPanel)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Tokyo up' })).toBeDisabled())

    expect(screen.getByRole('button', { name: 'Move Paris down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Paris up' })).toBeEnabled()
  })

  it('projects every clock onto the planned meeting time', async () => {
    await seed({ id: 'home', timeZone: LOCAL_ZONE, label: 'Home' })

    render(WorldClockPanel)
    await screen.findByText('Home')

    expect(screen.queryByLabelText('Meeting time')).toBeNull()

    await fireEvent.click(screen.getByLabelText('Plan a meeting time'))
    await fireEvent.input(screen.getByLabelText('Meeting time'), { target: { value: '09:00' } })

    await waitFor(() => expect(within(row(0)).getByText('09:00')).toBeInTheDocument())
    expect(within(row(0)).getByText('Working hours')).toBeInTheDocument()
  })

  it('flags a planned time that lands in the middle of the night', async () => {
    await seed({ id: 'home', timeZone: LOCAL_ZONE, label: 'Home' })

    render(WorldClockPanel)
    await screen.findByText('Home')

    await fireEvent.click(screen.getByLabelText('Plan a meeting time'))
    await fireEvent.input(screen.getByLabelText('Meeting time'), { target: { value: '03:30' } })

    await waitFor(() => expect(within(row(0)).getByText('03:30')).toBeInTheDocument())
    expect(within(row(0)).getByText('Asleep')).toBeInTheDocument()
  })

  it('appends a new zone to the end even when existing orders are sparse', async () => {
    await seed(
      { id: 'tokyo', timeZone: 'Asia/Tokyo', label: 'Tokyo', order: 0 },
      { id: 'paris', timeZone: 'Europe/Paris', label: 'Paris', order: 5 },
    )

    render(WorldClockPanel)
    await waitFor(() => expect(within(row(1)).getByText('Paris')).toBeInTheDocument())

    await fireEvent.input(zoneInput(), { target: { value: 'America/Denver' } })
    await fireEvent.click(addButton())

    await waitFor(() => expect(within(row(2)).getByText('Denver')).toBeInTheDocument())
  })

  it('offers the runtime time zone list for autocompletion', async () => {
    const { container } = render(WorldClockPanel)

    const options = container.querySelectorAll('datalist option')
    expect(options.length).toBeGreaterThan(100)
    expect([...options].some((o) => o.getAttribute('value') === 'Asia/Tokyo')).toBe(true)
  })

  it('shows an empty state before any clock is added', async () => {
    render(WorldClockPanel)

    expect(await screen.findByText(/no world clocks yet/i)).toBeInTheDocument()
  })
})
