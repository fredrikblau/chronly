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
  // Reserved for the full-screen takeover on the roadmap. Nothing acts on it
  // yet, so the alarm form deliberately does not offer a control for it — a
  // toggle that silently does nothing is worse than no toggle.
  fullScreenTakeover: boolean
  // Snoozing must not overwrite targetTimestamp: a recurring alarm re-derives
  // its time of day from it, so writing the snooze time there would shift
  // every future occurrence by the snooze length, compounding each time.
  snoozedUntil: number | null
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
  clockContrast: number
  reducedMotion: boolean
  background: BackgroundConfig
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  clockMode: 'digital',
  hour12: false,
  showSeconds: true,
  fontScale: 1,
  clockContrast: 1,
  reducedMotion: false,
  background: { type: 'solid', value: '#0b0b0f', accentColor: '#8b7cf6' },
}

export interface PomodoroStats {
  totalFocusSessionsCompleted: number
  totalFocusMs: number
}

export const DEFAULT_POMODORO_STATS: PomodoroStats = {
  totalFocusSessionsCompleted: 0,
  totalFocusMs: 0,
}

/**
 * The stopwatch counts up and never comes due, so it is not a SchedulableRecord
 * and the background worker never touches it. It still stores absolute epoch-ms
 * timestamps rather than a running counter: the popup is destroyed every time it
 * closes, and the elapsed time has to survive that.
 *
 * `laps` holds split times — the duration of each lap, not the running total —
 * newest first.
 */
export interface StopwatchState {
  status: 'idle' | 'running' | 'paused'
  startedAt: number | null
  elapsedMsBeforeStart: number
  laps: number[]
}

export const DEFAULT_STOPWATCH: StopwatchState = {
  status: 'idle',
  startedAt: null,
  elapsedMsBeforeStart: 0,
  laps: [],
}
