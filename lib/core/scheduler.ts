import type {
  AlarmRecord,
  AlarmRecurrence,
  CountdownRecord,
  PomodoroConfig,
  PomodoroRecord,
  SchedulableRecord,
} from './types'

let idCounter = 0

export function generateId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

export const SNOOZE_MS = 5 * 60_000

/**
 * A snoozed alarm is due at its snooze time; everything else at its target.
 * `??` rather than a `!== null` check on purpose: a record written before
 * `snoozedUntil` existed has it undefined, and treating that as a snooze time
 * would return undefined here and stop the alarm firing forever.
 */
export function effectiveDueTime(record: SchedulableRecord): number {
  if (record.kind === 'alarm') return record.snoozedUntil ?? record.targetTimestamp
  return record.targetTimestamp
}

export function isRecurring(alarm: AlarmRecord): boolean {
  return (alarm.recurrence?.days.length ?? 0) > 0
}

/**
 * Whether an alarm will ring again on its own. A one-off alarm that has rung is
 * spent even on records saved before the on/off switch existed, which never
 * had `enabled` written.
 */
export function isAlarmArmed(alarm: AlarmRecord): boolean {
  return alarm.enabled !== false && !(alarm.notified && !isRecurring(alarm))
}

export function isDue(record: SchedulableRecord, now: number): boolean {
  if (record.notified) return false
  if (record.kind === 'alarm' && record.enabled === false) return false
  if ((record.kind === 'countdown' || record.kind === 'pomodoro') && record.status !== 'running') return false
  return effectiveDueTime(record) <= now
}

export function snoozeAlarm(record: AlarmRecord, now: number, snoozeMs: number = SNOOZE_MS): AlarmRecord {
  // A one-off alarm switches itself off when it rings; snoozing it is a request
  // to ring again, so it has to be switched back on.
  return { ...record, enabled: true, snoozedUntil: now + snoozeMs, notified: false, updatedAt: now }
}

/**
 * Alarms fire by device-local wall-clock time (not a saved timezone) — the same
 * assumption a phone's alarm clock makes, and what "set an alarm for 7am" means
 * to a user.
 *
 * `days` (0 = Sunday) is the repeat schedule. Without it the answer is simply
 * today or tomorrow; with it the first ring has to land on a selected day,
 * otherwise a Mon/Wed alarm created on a Friday morning would ring that same
 * Friday before the recurrence logic ever gets a say.
 */
export function nextOccurrence(hour: number, minute: number, now: number, days?: number[]): number {
  const candidate = new Date(now)
  candidate.setHours(hour, minute, 0, 0)
  if (candidate.getTime() <= now) candidate.setDate(candidate.getDate() + 1)
  if (!days || days.length === 0) return candidate.getTime()
  for (let i = 0; i < 7; i++) {
    if (days.includes(candidate.getDay())) break
    candidate.setDate(candidate.getDate() + 1)
    // Re-apply the wall-clock time: a DST boundary crossed by the day step
    // would otherwise shift the alarm by an hour.
    candidate.setHours(hour, minute, 0, 0)
  }
  return candidate.getTime()
}

/**
 * Switch an alarm back on. Its stored target may be long past — a one-off that
 * already rang, or a recurring alarm that was off over several of its days — so
 * the next ring is re-derived from its time of day rather than trusted.
 */
export function enableAlarm(record: AlarmRecord, now: number): AlarmRecord {
  const time = new Date(record.targetTimestamp)
  return {
    ...record,
    enabled: true,
    notified: false,
    snoozedUntil: null,
    targetTimestamp: nextOccurrence(time.getHours(), time.getMinutes(), now, record.recurrence?.days),
    updatedAt: now,
  }
}

export function disableAlarm(record: AlarmRecord, now: number): AlarmRecord {
  return { ...record, enabled: false, snoozedUntil: null, updatedAt: now }
}

export interface AlarmEdit {
  label: string
  hour: number
  minute: number
  days: number[]
  soundId: string
  volume: number
}

/** Apply the alarm form to an existing alarm, keeping its identity. */
export function editAlarm(record: AlarmRecord, edit: AlarmEdit, now: number): AlarmRecord {
  const days = [...edit.days].sort((a, b) => a - b)
  return {
    ...record,
    label: edit.label,
    soundId: edit.soundId,
    volume: edit.volume,
    recurrence: days.length ? { days } : null,
    targetTimestamp: nextOccurrence(edit.hour, edit.minute, now, days),
    enabled: true,
    notified: false,
    snoozedUntil: null,
    updatedAt: now,
  }
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
    record.phase === 'focus'
      ? nextCycleCount % record.config.cyclesBeforeLongBreak === 0
        ? 'longBreak'
        : 'shortBreak'
      : 'focus'
  const duration =
    nextPhase === 'focus'
      ? record.config.focusMs
      : nextPhase === 'shortBreak'
        ? record.config.shortBreakMs
        : record.config.longBreakMs
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
    // A snooze that has now fired is spent; the recurrence is still computed
    // from the untouched targetTimestamp.
    const cleared: AlarmRecord = { ...notified, snoozedUntil: null }
    const next = computeNextAlarmOccurrence(cleared, now)
    // A one-off alarm stays listed once it has rung, like a phone's, and reads
    // as off (see isAlarmArmed) so it can be switched back on for the same time.
    // `enabled` is deliberately left alone: the background treats a change to
    // it as the user switching the alarm off, which silences the ring.
    if (next === null) return cleared
    return { ...cleared, targetTimestamp: next, notified: false, updatedAt: now }
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
    snoozedUntil: null,
    enabled: true,
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

/**
 * Add time to a countdown without restarting it. A finished timer starts again
 * from the extra time, which is what "+1 min" on a timer that just rang means.
 */
export function extendCountdown(record: CountdownRecord, extraMs: number, now: number): CountdownRecord {
  if (record.status === 'paused') {
    return {
      ...record,
      durationMs: record.durationMs + extraMs,
      remainingMsAtPause: (record.remainingMsAtPause ?? 0) + extraMs,
      updatedAt: now,
    }
  }
  if (record.status === 'completed') {
    return {
      ...record,
      durationMs: extraMs,
      targetTimestamp: now + extraMs,
      status: 'running',
      notified: false,
      remainingMsAtPause: null,
      updatedAt: now,
    }
  }
  const remaining = Math.max(0, record.targetTimestamp - now)
  return {
    ...record,
    durationMs: Math.max(record.durationMs, remaining) + extraMs,
    targetTimestamp: Math.max(record.targetTimestamp, now) + extraMs,
    updatedAt: now,
  }
}

/**
 * End the current Pomodoro phase early and move on, without the alert. A
 * skipped focus phase is not a completed one, so it is not counted in stats.
 */
export function skipPomodoroPhase(record: PomodoroRecord, now: number): PomodoroRecord {
  const advanced = advancePomodoroPhase(record, now)
  return record.status === 'paused' ? pauseRecord(advanced, now) : advanced
}

export function pauseRecord<T extends CountdownRecord | PomodoroRecord>(record: T, now: number): T {
  if (record.status !== 'running') return record
  return { ...record, status: 'paused', remainingMsAtPause: record.targetTimestamp - now, updatedAt: now }
}

export function resumeRecord<T extends CountdownRecord | PomodoroRecord>(record: T, now: number): T {
  if (record.status !== 'paused' || record.remainingMsAtPause === null) return record
  return {
    ...record,
    status: 'running',
    targetTimestamp: now + record.remainingMsAtPause,
    remainingMsAtPause: null,
    updatedAt: now,
  }
}
