export type RecordStatus = 'running' | 'paused' | 'completed'

export interface BaseRecord {
  id: string
  label: string
  soundId: string
  volume: number // 0..1
  notified: boolean
  createdAt: number
  updatedAt: number
}

export interface AlarmRecurrence {
  days: number[] // 0 = Sunday .. 6 = Saturday
}

export interface AlarmRecord extends BaseRecord {
  kind: 'alarm'
  targetTimestamp: number
  recurrence: AlarmRecurrence | null // null = one-off
  fullScreenTakeover: boolean
}

export interface CountdownRecord extends BaseRecord {
  kind: 'countdown'
  durationMs: number
  targetTimestamp: number
  status: RecordStatus
  remainingMsAtPause: number | null
}

export interface PomodoroConfig {
  focusMs: number
  shortBreakMs: number
  longBreakMs: number
  cyclesBeforeLongBreak: number
}

export interface PomodoroRecord extends BaseRecord {
  kind: 'pomodoro'
  phase: 'focus' | 'shortBreak' | 'longBreak'
  cycleCount: number
  config: PomodoroConfig
  targetTimestamp: number
  status: RecordStatus
  remainingMsAtPause: number | null
}

export type SchedulableRecord = AlarmRecord | CountdownRecord | PomodoroRecord

export interface WorldClockEntry {
  id: string
  timeZone: string // IANA zone name, e.g. "Asia/Kolkata"
  label: string
  color: string
  order: number
}

export interface BackgroundConfig {
  type: 'solid' | 'gradient' | 'image'
  value: string // css color, css gradient, or image data/URL
  accentColor: string
}

export interface Settings {
  theme: 'light' | 'dark' | 'auto'
  clockMode: 'digital' | 'analog' | 'both'
  hour12: boolean
  showSeconds: boolean
  fontScale: number
  reducedMotion: boolean
  background: BackgroundConfig
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  clockMode: 'digital',
  hour12: false,
  showSeconds: true,
  fontScale: 1,
  reducedMotion: false,
  background: { type: 'solid', value: '#0b0b0f', accentColor: '#8b7cf6' },
}
