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
  return new Date(timestamp)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
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

  it('reports a failed alarm preview', async () => {
    vi.spyOn(fakeBrowser.notifications, 'create').mockRejectedValue(new Error('notifications unavailable'))

    render(AlarmsPanel)
    await fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not show the alarm preview')
  })

  it('switches an alarm off and back on from its row', async () => {
    const store = seedStore()
    const alarm = createAlarm('Switchable', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM)
    await store.upsert(alarm)

    render(AlarmsPanel)
    const toggle = await screen.findByRole('switch', { name: 'Switchable alarm' })
    expect(toggle).toBeChecked()

    await fireEvent.click(toggle)
    await waitFor(async () => expect(await store.get(alarm.id)).toMatchObject({ enabled: false }))
    expect(await screen.findByText('Off')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('switch', { name: 'Switchable alarm' }))
    await waitFor(async () => expect(await store.get(alarm.id)).toMatchObject({ enabled: true, notified: false }))
    // Switching back on re-derives the next ring from now, never a stale target.
    const rearmed = (await store.get(alarm.id)) as AlarmRecord
    expect(rearmed.targetTimestamp).toBeGreaterThan(Date.now())
  })

  it('shows a rung one-off alarm as switched off', async () => {
    await seedStore().upsert({ ...createAlarm('Spent', MONDAY_6AM, MONDAY_6AM), notified: true, enabled: false })

    render(AlarmsPanel)

    expect(await screen.findByRole('switch', { name: 'Spent alarm' })).not.toBeChecked()
    expect(screen.getByText('Rang · off')).toBeInTheDocument()
  })

  it('edits an alarm in place, keeping its identity', async () => {
    const store = seedStore()
    const alarm = createAlarm('Editable', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM)
    await store.upsert(alarm)

    render(AlarmsPanel)
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit alarm Editable' }))

    expect(screen.getByLabelText('Time')).toHaveValue('07:00')
    expect(screen.getByPlaceholderText('Label')).toHaveValue('Editable')
    await fireEvent.input(screen.getByPlaceholderText('Label'), { target: { value: 'Edited' } })
    await fireEvent.input(screen.getByLabelText('Time'), { target: { value: '08:15' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Friday' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Edited')).toBeInTheDocument()
    const stored = onlyAlarm(await store.getAll())
    expect(stored.id).toBe(alarm.id)
    expect(stored.recurrence).toEqual({ days: [5] })
    expect(new Date(stored.targetTimestamp).getHours()).toBe(8)
    // The form returns to creating a new alarm.
    expect(await screen.findByRole('button', { name: 'Add alarm' })).toBeInTheDocument()
  })

  it('cancels an edit without saving', async () => {
    const store = seedStore()
    await store.upsert(createAlarm('Untouched', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM))

    render(AlarmsPanel)
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit alarm Untouched' }))
    await fireEvent.input(screen.getByPlaceholderText('Label'), { target: { value: 'Changed' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByPlaceholderText('Label')).toHaveValue('')
    expect(onlyAlarm(await store.getAll()).label).toBe('Untouched')
  })

  it('fills the repeat days from a preset', async () => {
    render(AlarmsPanel)

    await fireEvent.click(screen.getByRole('button', { name: 'Weekdays' }))

    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'false')
  })
})
