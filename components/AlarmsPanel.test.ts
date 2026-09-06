import { fakeBrowser } from '@webext-core/fake-browser'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAlarm } from '../lib/core/scheduler'
import { createExtensionStorageBackend, RecordStore } from '../lib/core/storage'
import type { AlarmRecord, SchedulableRecord } from '../lib/core/types'
import { recordActions } from '../lib/ui/records'
import AlarmsPanel from './AlarmsPanel.svelte'

// 2026-02-02 is a Monday in local time.
const MONDAY_6AM = new Date(2026, 1, 2, 6, 0, 0).getTime()

function seedStore() {
  return new RecordStore(createExtensionStorageBackend('local'))
}

/** The basic-format UTC stamp both the Google link and the .ics file use. */
function toIcsDate(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function onlyAlarm(stored: SchedulableRecord[]): AlarmRecord {
  const [record] = stored
  if (record?.kind !== 'alarm') throw new Error('expected exactly one alarm record')
  return record
}

describe('AlarmsPanel', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  it('lists an existing alarm with its time and schedule', async () => {
    const store = seedStore()
    await store.upsert(createAlarm('Wake up', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM))

    render(AlarmsPanel)

    expect(await screen.findByText('Wake up')).toBeInTheDocument()
    expect(screen.getByText('07:00')).toBeInTheDocument()
    expect(screen.getByText('Once')).toBeInTheDocument()
  })

  it('shows an empty state when there are no alarms', async () => {
    render(AlarmsPanel)

    expect(await screen.findByText(/no alarms yet/i)).toBeInTheDocument()
  })

  it('creates a new alarm from the form', async () => {
    render(AlarmsPanel)

    await fireEvent.input(screen.getByPlaceholderText('Label'), { target: { value: 'Standup' } })
    await fireEvent.click(screen.getByText('Add alarm'))

    expect(await screen.findByText('Standup')).toBeInTheDocument()
    expect(screen.queryByText(/no alarms yet/i)).toBeNull()
  })

  it('keeps the alarm draft when storage rejects it', async () => {
    let rejectWrite: (reason?: unknown) => void = () => undefined
    vi.spyOn(recordActions, 'upsert').mockImplementation(() => {
      const write = new Promise<void>((_resolve, reject) => (rejectWrite = reject))
      void write.catch(() => undefined)
      return write
    })
    render(AlarmsPanel)
    const label = screen.getByPlaceholderText('Label')
    const monday = screen.getByRole('button', { name: 'Monday' })
    const add = screen.getByRole('button', { name: 'Add alarm' })
    await fireEvent.input(label, { target: { value: 'Standup' } })
    await fireEvent.click(monday)

    await fireEvent.click(add)
    const disabledWhileSaving = add.hasAttribute('disabled') && label.hasAttribute('disabled')
    rejectWrite(new Error('storage unavailable'))

    expect(disabledWhileSaving).toBe(true)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(label).toHaveValue('Standup')
    expect(monday).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add alarm' })).toBeEnabled()
  })

  it('persists the created alarm through the shared record store', async () => {
    render(AlarmsPanel)

    await fireEvent.input(screen.getByPlaceholderText('Label'), { target: { value: 'Standup' } })
    await fireEvent.input(screen.getByLabelText('Time'), { target: { value: '09:30' } })
    await fireEvent.click(screen.getByText('Add alarm'))

    await screen.findByText('Standup')
    const stored = await seedStore().getAll()
    expect(stored).toHaveLength(1)
    const alarm = onlyAlarm(stored)
    expect(alarm.label).toBe('Standup')
    const target = new Date(alarm.targetTimestamp)
    expect(target.getHours()).toBe(9)
    expect(target.getMinutes()).toBe(30)
  })

  it('falls back to a default label when none is typed', async () => {
    render(AlarmsPanel)

    await fireEvent.click(screen.getByText('Add alarm'))

    expect(await screen.findByText('Alarm')).toBeInTheDocument()
  })

  it('records the selected repeat days and shows them on the alarm', async () => {
    render(AlarmsPanel)

    await fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Wednesday' }))
    await fireEvent.click(screen.getByText('Add alarm'))

    expect(await screen.findByText('Mon, Wed')).toBeInTheDocument()
    const alarm = onlyAlarm(await seedStore().getAll())
    expect(alarm.recurrence?.days).toEqual([1, 3])
  })

  it('exposes day toggles as pressable buttons and clears them after adding', async () => {
    render(AlarmsPanel)

    const monday = screen.getByRole('button', { name: 'Monday' })
    expect(monday).toHaveAttribute('aria-pressed', 'false')

    await fireEvent.click(monday)
    expect(monday).toHaveAttribute('aria-pressed', 'true')

    await fireEvent.click(monday)
    expect(monday).toHaveAttribute('aria-pressed', 'false')
  })

  it('deletes an alarm', async () => {
    const store = seedStore()
    await store.upsert(createAlarm('Wake up', MONDAY_6AM, MONDAY_6AM))

    render(AlarmsPanel)
    await screen.findByText('Wake up')

    await fireEvent.click(screen.getByRole('button', { name: 'Delete alarm Wake up' }))

    await waitFor(() => expect(screen.queryByText('Wake up')).toBeNull())
    expect(await seedStore().getAll()).toEqual([])
  })

  it('marks a snoozed alarm', async () => {
    const store = seedStore()
    const alarm = createAlarm('Wake up', MONDAY_6AM, MONDAY_6AM)
    await store.upsert({ ...alarm, snoozedUntil: Date.now() + 300_000 })

    render(AlarmsPanel)

    expect(await screen.findByText('Snoozed')).toBeInTheDocument()
  })

  it('shows the snoozed time instead of the original alarm time', async () => {
    const originalTime = new Date(2026, 1, 2, 6, 0).getTime()
    const snoozedUntil = new Date(2026, 1, 2, 6, 5).getTime()
    const alarm = createAlarm('Wake up', originalTime, originalTime)
    await seedStore().upsert({ ...alarm, snoozedUntil })

    render(AlarmsPanel)

    expect(await screen.findByText('06:05')).toBeInTheDocument()
    expect(screen.queryByText('06:00')).toBeNull()
  })

  it('opens a pre-filled Google Calendar event for an alarm', async () => {
    await seedStore().upsert(createAlarm('Wake up', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM))
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    render(AlarmsPanel)
    await screen.findByText('Wake up')
    await fireEvent.click(screen.getByRole('button', { name: 'Add alarm Wake up to Google Calendar' }))

    expect(open).toHaveBeenCalledWith(expect.any(String), '_blank', 'noopener,noreferrer')
    const link = new URL(open.mock.calls[0]?.[0] as string)
    expect(`${link.origin}${link.pathname}`).toBe('https://calendar.google.com/calendar/render')
    expect(link.searchParams.get('text')).toBe('Wake up')
  })

  it('anchors the calendar event to the snoozed time rather than the original one', async () => {
    // A label of its own: `records` is a module store whose last value outlives
    // an unmount, so a shared label would let the previous test's row answer.
    const alarm = createAlarm('Snoozed ring', MONDAY_6AM, MONDAY_6AM)
    const snoozedUntil = Date.now() + 300_000
    await seedStore().upsert({ ...alarm, snoozedUntil })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    render(AlarmsPanel)
    await screen.findByText('Snoozed ring')
    await fireEvent.click(screen.getByRole('button', { name: 'Add alarm Snoozed ring to Google Calendar' }))

    const dates = new URL(open.mock.calls[0]?.[0] as string).searchParams.get('dates')
    expect(dates?.split('/')[0]).toBe(toIcsDate(snoozedUntil))
  })

  it('downloads an .ics file for an alarm', async () => {
    await seedStore().upsert(createAlarm('Wake up', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM))
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chronly-test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(AlarmsPanel)
    await screen.findByText('Wake up')
    await fireEvent.click(screen.getByRole('button', { name: 'Download the .ics calendar file for alarm Wake up' }))

    expect(click).toHaveBeenCalled()
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(await blob.text()).toContain('SUMMARY:Wake up')
  })

  it('previews the alarm without saving it when Test is pressed', async () => {
    const create = vi.spyOn(fakeBrowser.notifications, 'create').mockResolvedValue(undefined)

    render(AlarmsPanel)
    await fireEvent.input(screen.getByPlaceholderText('Label'), { target: { value: 'Standup' } })
    await fireEvent.click(screen.getByRole('button', { name: /test/i }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    const [, options] = create.mock.calls[0] ?? []
    expect(options).toMatchObject({ title: 'Standup' })
    expect(await seedStore().getAll()).toEqual([])
  })
})
