import { createAlarm, disableAlarm, enableAlarm, isAlarmArmed } from './scheduler'
import type { AlarmRecord, Settings, WorldClockEntry } from './types'
import { DEFAULT_SETTINGS } from './types'

/**
 * A portable copy of what someone sets up by hand: appearance, world clocks,
 * and alarms. Running timers, Pomodoro sessions, and the stopwatch are moments
 * rather than setup, and imported sounds can run to megabytes, so they stay out.
 * There is no account and no server, so this file is the backup.
 */
export interface ChronlyBackup {
  app: 'chronly'
  version: 1
  exportedAt: string
  settings: Settings
  worldClocks: WorldClockEntry[]
  alarms: AlarmRecord[]
}

export function createBackup(
  data: { settings: Settings; worldClocks: WorldClockEntry[]; alarms: AlarmRecord[] },
  now: number,
): ChronlyBackup {
  return {
    app: 'chronly',
    version: 1,
    exportedAt: new Date(now).toISOString(),
    settings: data.settings,
    worldClocks: data.worldClocks,
    alarms: data.alarms,
  }
}

export class BackupError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function readSettings(value: unknown): Settings {
  if (!isObject(value)) return DEFAULT_SETTINGS
  const pick = <K extends keyof Settings>(key: K, valid: (v: unknown) => boolean): Settings[K] =>
    valid(value[key]) ? (value[key] as Settings[K]) : DEFAULT_SETTINGS[key]
  const background = isObject(value.background) ? value.background : {}
  return {
    theme: pick('theme', (v) => v === 'light' || v === 'dark' || v === 'auto'),
    clockMode: pick('clockMode', (v) => v === 'digital' || v === 'analog' || v === 'both'),
    hour12: pick('hour12', (v) => typeof v === 'boolean'),
    showSeconds: pick('showSeconds', (v) => typeof v === 'boolean'),
    fontScale: pick('fontScale', (v) => isFiniteNumber(v) && v >= 0.5 && v <= 2),
    clockContrast: pick('clockContrast', (v) => isFiniteNumber(v) && v >= 0.5 && v <= 2),
    reducedMotion: pick('reducedMotion', (v) => typeof v === 'boolean'),
    background: {
      type: background.type === 'gradient' ? 'gradient' : 'solid',
      value: typeof background.value === 'string' ? background.value : DEFAULT_SETTINGS.background.value,
      accentColor:
        typeof background.accentColor === 'string' ? background.accentColor : DEFAULT_SETTINGS.background.accentColor,
    },
  }
}

function isKnownZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function readWorldClocks(value: unknown): WorldClockEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (entry): entry is WorldClockEntry =>
        isObject(entry) &&
        typeof entry.timeZone === 'string' &&
        isKnownZone(entry.timeZone) &&
        typeof entry.label === 'string',
    )
    .map((entry, index) => ({
      id: typeof entry.id === 'string' ? entry.id : `wc-import-${index}`,
      timeZone: entry.timeZone,
      label: entry.label.slice(0, 80),
      color: typeof entry.color === 'string' ? entry.color : '#8b7cf6',
      order: index,
    }))
}

function readAlarms(value: unknown): AlarmRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (alarm): alarm is AlarmRecord =>
      isObject(alarm) &&
      alarm.kind === 'alarm' &&
      typeof alarm.label === 'string' &&
      isFiniteNumber(alarm.targetTimestamp) &&
      (alarm.recurrence === null ||
        (isObject(alarm.recurrence) &&
          Array.isArray(alarm.recurrence.days) &&
          alarm.recurrence.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))),
  )
}

/** Parse and validate a backup file. Unknown or damaged fields fall back to defaults. */
export function parseBackup(text: string): ChronlyBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not a Chronly backup.')
  }
  if (!isObject(raw) || raw.app !== 'chronly') throw new BackupError('That file is not a Chronly backup.')
  if (raw.version !== 1) throw new BackupError('This backup was made by a newer version of Chronly.')
  return {
    app: 'chronly',
    version: 1,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    settings: readSettings(raw.settings),
    worldClocks: readWorldClocks(raw.worldClocks),
    alarms: readAlarms(raw.alarms),
  }
}

/** A stable description of when an alarm rings, used to skip duplicates. */
function alarmSignature(alarm: AlarmRecord): string {
  const at = new Date(alarm.targetTimestamp)
  const days = [...(alarm.recurrence?.days ?? [])].sort().join(',')
  return `${alarm.label}|${at.getHours()}:${at.getMinutes()}|${days}`
}

export interface ImportPlan {
  settings: Settings
  worldClocks: WorldClockEntry[]
  alarms: AlarmRecord[]
  skippedAlarms: number
  skippedWorldClocks: number
}

/**
 * Merge a backup into what is already saved. Nothing existing is removed:
 * world clocks and alarms already present are skipped, and imported alarms get
 * fresh ids and a next ring computed from now, since their saved targets are
 * from whenever the backup was made.
 */
export function planImport(
  backup: ChronlyBackup,
  existing: { worldClocks: WorldClockEntry[]; alarms: AlarmRecord[] },
  now: number,
): ImportPlan {
  const zones = new Set(existing.worldClocks.map((entry) => entry.timeZone.toLowerCase()))
  const nextOrder = existing.worldClocks.reduce((max, entry) => Math.max(max, entry.order), -1) + 1
  const worldClocks = backup.worldClocks
    .filter((entry) => !zones.has(entry.timeZone.toLowerCase()))
    .map((entry, index) => ({ ...entry, id: `wc-${now}-${index}`, order: nextOrder + index }))

  const signatures = new Set(existing.alarms.map(alarmSignature))
  const alarms = backup.alarms
    .filter((alarm) => !signatures.has(alarmSignature(alarm)))
    .map((alarm) => {
      // Rebuilt from the known fields only, so nothing unexpected in the file
      // reaches storage. Imported sounds are not in the backup, so an alarm
      // that used one falls back to the default tone.
      const days = alarm.recurrence?.days ?? []
      const fresh = enableAlarm(
        createAlarm(alarm.label.slice(0, 80), alarm.targetTimestamp, now, days.length ? { days: [...days] } : null, {
          soundId:
            typeof alarm.soundId === 'string' && !alarm.soundId.startsWith('custom-') ? alarm.soundId : 'default',
          volume: isFiniteNumber(alarm.volume) ? Math.min(1, Math.max(0, alarm.volume)) : 0.8,
        }),
        now,
      )
      return isAlarmArmed(alarm) ? fresh : disableAlarm(fresh, now)
    })

  return {
    settings: backup.settings,
    worldClocks,
    alarms,
    skippedAlarms: backup.alarms.length - alarms.length,
    skippedWorldClocks: backup.worldClocks.length - worldClocks.length,
  }
}
