import { describe, expect, it } from 'vitest'
import { BackupError, createBackup, parseBackup, planImport } from './backup'
import { createAlarm, disableAlarm } from './scheduler'
import { DEFAULT_SETTINGS, type WorldClockEntry } from './types'

// 2026-02-02 is a Monday in local time.
const MONDAY_6AM = new Date(2026, 1, 2, 6, 0).getTime()

const tokyo: WorldClockEntry = { id: 'wc-1', timeZone: 'Asia/Tokyo', label: 'Tokyo', color: '#ff0000', order: 0 }
const paris: WorldClockEntry = { id: 'wc-2', timeZone: 'Europe/Paris', label: 'Paris', color: '#00ff00', order: 1 }

function roundTrip(data: Parameters<typeof createBackup>[0]) {
  return parseBackup(JSON.stringify(createBackup(data, MONDAY_6AM)))
}

describe('parseBackup', () => {
  it('reads back what createBackup wrote', () => {
    const alarm = createAlarm('Wake up', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM)
    const backup = roundTrip({ settings: { ...DEFAULT_SETTINGS, hour12: true }, worldClocks: [tokyo], alarms: [alarm] })
    expect(backup.settings.hour12).toBe(true)
    expect(backup.worldClocks).toEqual([tokyo])
    expect(backup.alarms).toHaveLength(1)
  })

  it('rejects text that is not JSON or not a Chronly backup', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a Chronly backup')
  })

  it('rejects a backup from a newer format version', () => {
    expect(() => parseBackup('{"app":"chronly","version":2}')).toThrow('newer version')
  })

  it('replaces damaged settings with defaults instead of failing', () => {
    const backup = parseBackup(
      JSON.stringify({ app: 'chronly', version: 1, settings: { theme: 'neon', fontScale: 99, hour12: true } }),
    )
    expect(backup.settings.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(backup.settings.fontScale).toBe(DEFAULT_SETTINGS.fontScale)
    expect(backup.settings.hour12).toBe(true)
  })

  it('keeps a valid snooze length and replaces a nonsense one', () => {
    const read = (snoozeMinutes: unknown) =>
      parseBackup(JSON.stringify({ app: 'chronly', version: 1, settings: { snoozeMinutes } })).settings.snoozeMinutes
    expect(read(15)).toBe(15)
    expect(read(0)).toBe(DEFAULT_SETTINGS.snoozeMinutes)
    expect(read('ten')).toBe(DEFAULT_SETTINGS.snoozeMinutes)
  })

  it('drops world clocks in zones this browser does not know and malformed alarms', () => {
    const backup = parseBackup(
      JSON.stringify({
        app: 'chronly',
        version: 1,
        worldClocks: [tokyo, { ...paris, timeZone: 'Mars/Olympus' }],
        alarms: [{ kind: 'alarm', label: 'Bad', targetTimestamp: 'soon', recurrence: null }],
      }),
    )
    expect(backup.worldClocks.map((entry) => entry.label)).toEqual(['Tokyo'])
    expect(backup.alarms).toEqual([])
  })
})

describe('planImport', () => {
  it('adds only world clocks that are not already saved, after the existing ones', () => {
    const backup = roundTrip({ settings: DEFAULT_SETTINGS, worldClocks: [tokyo, paris], alarms: [] })
    const plan = planImport(backup, { worldClocks: [{ ...tokyo, order: 4 }], alarms: [] }, MONDAY_6AM)
    expect(plan.worldClocks.map((entry) => [entry.label, entry.order])).toEqual([['Paris', 5]])
    expect(plan.skippedWorldClocks).toBe(1)
  })

  it('skips alarms that already exist and re-arms the rest from now', () => {
    const existing = createAlarm('Wake up', new Date(2026, 1, 2, 7, 0).getTime(), MONDAY_6AM)
    const gym = createAlarm('Gym', new Date(2025, 0, 1, 18, 30).getTime(), 0, { days: [1, 3] })
    const backup = roundTrip({ settings: DEFAULT_SETTINGS, worldClocks: [], alarms: [existing, gym] })

    const plan = planImport(backup, { worldClocks: [], alarms: [existing] }, MONDAY_6AM)

    expect(plan.skippedAlarms).toBe(1)
    expect(plan.alarms).toHaveLength(1)
    const [imported] = plan.alarms
    expect(imported?.id).not.toBe(gym.id)
    expect(imported?.recurrence).toEqual({ days: [1, 3] })
    expect(new Date(imported!.targetTimestamp)).toEqual(new Date(2026, 1, 2, 18, 30))
  })

  it('keeps a switched-off alarm switched off', () => {
    const off = disableAlarm(createAlarm('Nap', new Date(2026, 1, 2, 14, 0).getTime(), MONDAY_6AM), MONDAY_6AM)
    const plan = planImport(
      roundTrip({ settings: DEFAULT_SETTINGS, worldClocks: [], alarms: [off] }),
      {
        worldClocks: [],
        alarms: [],
      },
      MONDAY_6AM,
    )
    expect(plan.alarms[0]?.enabled).toBe(false)
  })

  it('falls back to the default tone for an alarm that used an imported sound', () => {
    const alarm = createAlarm('Wake up', MONDAY_6AM, MONDAY_6AM, null, { soundId: 'custom-123' })
    const plan = planImport(
      roundTrip({ settings: DEFAULT_SETTINGS, worldClocks: [], alarms: [alarm] }),
      {
        worldClocks: [],
        alarms: [],
      },
      MONDAY_6AM,
    )
    expect(plan.alarms[0]?.soundId).toBe('default')
  })
})
