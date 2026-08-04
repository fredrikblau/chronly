import type { AlarmRecord, AlarmRecurrence, CountdownRecord, PomodoroConfig, PomodoroRecord, SchedulableRecord } from './types'

let idCounter = 0

export function generateId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

export function isDue(record: SchedulableRecord, now: number): boolean {
  if (record.notified) return false
  if ((record.kind === 'countdown' || record.kind === 'pomodoro') && record.status !== 'running') return false
  return record.targetTimestamp <= now
}

export function computeDueRecords(records: SchedulableRecord[], now: number): SchedulableRecord[] {
  return records.filter((r) => isDue(r, now))
}

export function markNotified(record: SchedulableRecord, now: number): SchedulableRecord {
  return { ...record, notified: true, updatedAt: now }
}

export function computeNextAlarmOccurrence(record: AlarmRecord, after: number): number | null {
  if (!record.recurrence || record.recurrence.days.length === 0) return null
  const target = new Date(record.targetTimestamp)
  const hours = target.getHours()
  const minutes = target.getMinutes()
  let candidate = new Date(after)
  candidate.setHours(hours, minutes, 0, 0)
  for (let i = 0; i < 8; i++) {
    if (candidate.getTime() > after && record.recurrence.days.includes(candidate.getDay())) {
      return candidate.getTime()
    }
    candidate = new Date(candidate.getTime() + 86_400_000)
    candidate.setHours(hours, minutes, 0, 0)
  }
  return null
}

export function advancePomodoroPhase(record: PomodoroRecord, now: number): PomodoroRecord {
  const nextCycleCount = record.phase === 'focus' ? record.cycleCount + 1 : record.cycleCount
  const nextPhase: PomodoroRecord['phase'] =
    record.phase === 'focus' ? (nextCycleCount % record.config.cyclesBeforeLongBreak === 0 ? 'longBreak' : 'shortBreak') : 'focus'
  const duration =
    nextPhase === 'focus' ? record.config.focusMs : nextPhase === 'shortBreak' ? record.config.shortBreakMs : record.config.longBreakMs
  return {
    ...record,
    phase: nextPhase,
    cycleCount: nextCycleCount,
    targetTimestamp: now + duration,
    status: 'running',
    notified: false,
    remainingMsAtPause: null,
    updatedAt: now,
  }
}

export function reconcileFiredRecord(record: SchedulableRecord, now: number): SchedulableRecord {
  const notified = markNotified(record, now)
  if (notified.kind === 'alarm') {
    const next = computeNextAlarmOccurrence(notified, now)
    if (next === null) return notified // one-off: stays in storage, notified=true, until dismissed or snoozed
    return { ...notified, targetTimestamp: next, notified: false, updatedAt: now }
  }
  if (notified.kind === 'countdown') {
    return { ...notified, status: 'completed', updatedAt: now }
  }
  return advancePomodoroPhase(notified, now)
}

export function createCountdown(
  label: string,
  durationMs: number,
  now: number,
  opts: Partial<Pick<CountdownRecord, 'soundId' | 'volume'>> = {},
): CountdownRecord {
  return {
    id: generateId('countdown'),
    kind: 'countdown',
    label,
    durationMs,
    targetTimestamp: now + durationMs,
    status: 'running',
    remainingMsAtPause: null,
    soundId: opts.soundId ?? 'default',
    volume: opts.volume ?? 0.8,
    notified: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function createAlarm(
  label: string,
  targetTimestamp: number,
  now: number,
  recurrence: AlarmRecurrence | null = null,
  opts: Partial<Pick<AlarmRecord, 'soundId' | 'volume' | 'fullScreenTakeover'>> = {},
): AlarmRecord {
  return {
    id: generateId('alarm'),
    kind: 'alarm',
    label,
    targetTimestamp,
    recurrence,
    fullScreenTakeover: opts.fullScreenTakeover ?? false,
    soundId: opts.soundId ?? 'default',
    volume: opts.volume ?? 0.8,
    notified: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function createPomodoro(
  label: string,
  config: PomodoroConfig,
  now: number,
  opts: Partial<Pick<PomodoroRecord, 'soundId' | 'volume'>> = {},
): PomodoroRecord {
  return {
    id: generateId('pomodoro'),
    kind: 'pomodoro',
    label,
    phase: 'focus',
    cycleCount: 0,
    config,
    targetTimestamp: now + config.focusMs,
    status: 'running',
    remainingMsAtPause: null,
    soundId: opts.soundId ?? 'default',
    volume: opts.volume ?? 0.8,
    notified: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function pauseRecord<T extends CountdownRecord | PomodoroRecord>(record: T, now: number): T {
  if (record.status !== 'running') return record
  return { ...record, status: 'paused', remainingMsAtPause: record.targetTimestamp - now, updatedAt: now }
}

export function resumeRecord<T extends CountdownRecord | PomodoroRecord>(record: T, now: number): T {
  if (record.status !== 'paused' || record.remainingMsAtPause === null) return record
  return { ...record, status: 'running', targetTimestamp: now + record.remainingMsAtPause, remainingMsAtPause: null, updatedAt: now }
}
