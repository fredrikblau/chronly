import { browser } from 'wxt/browser'

export interface SoundPreset {
  id: string
  label: string
  frequency: number
  beeps: number
}

const DEFAULT_PRESET: SoundPreset = {
  id: 'default',
  label: 'Classic beep',
  frequency: 880,
  beeps: 3,
}

export const SOUND_PRESETS: SoundPreset[] = [
  DEFAULT_PRESET,
  { id: 'gentle', label: 'Gentle chime', frequency: 523, beeps: 2 },
  { id: 'urgent', label: 'Urgent alert', frequency: 1046, beeps: 5 },
]

export function resolveSoundPreset(soundId: string): SoundPreset {
  return SOUND_PRESETS.find((p) => p.id === soundId) ?? DEFAULT_PRESET
}

export interface PlaySoundMessage {
  target: 'offscreen'
  type: 'play-sound'
  soundId: string
  volume: number
}

export function buildPlaySoundMessage(soundId: string, volume: number): PlaySoundMessage {
  return { target: 'offscreen', type: 'play-sound', soundId, volume }
}

/** `runtime.onMessage` delivers every message any context broadcasts, so the
 *  offscreen document has to narrow a genuinely unknown value. */
export function isPlaySoundMessage(message: unknown): message is PlaySoundMessage {
  if (typeof message !== 'object' || message === null) return false
  const candidate = message as Partial<PlaySoundMessage>
  return (
    candidate.target === 'offscreen' &&
    candidate.type === 'play-sound' &&
    typeof candidate.soundId === 'string' &&
    typeof candidate.volume === 'number'
  )
}

const OFFSCREEN_URL = '/offscreen.html'
const BEEP_MS = 250
const BEEP_GAP_MS = 150
const RETRY_DELAY_MS = 100
/** Ramp length used to fade each beep in and out; without it the abrupt
 *  start/stop of the oscillator is audible as a click. */
const RAMP_S = 0.01

/**
 * Chrome allows exactly one offscreen document and rejects a second
 * `createDocument`. The check-then-create below is not atomic, and two records
 * coming due in the same tick is normal — `computeDueRecords` returns a list —
 * so concurrent callers share one in-flight creation instead of racing.
 */
let creatingOffscreenDocument: Promise<void> | null = null

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  if (contexts.length > 0) return
  creatingOffscreenDocument ??= browser.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play the selected alarm/timer sound when it fires.',
    })
    .finally(() => {
      creatingOffscreenDocument = null
    })
  await creatingOffscreenDocument
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function playTone(frequency: number, volume: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime
    const end = start + durationMs / 1000
    // Never let the two ramps overlap, which would schedule the sustain point
    // before the attack finishes (or before `start`) for very short beeps.
    const ramp = Math.min(RAMP_S, durationMs / 2000)

    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(volume, start + ramp)
    gain.gain.setValueAtTime(volume, end - ramp)
    gain.gain.linearRampToValueAtTime(0, end)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(end)
    oscillator.onended = () => {
      void context.close()
      resolve()
    }
  })
}

export async function playPresetLocally(soundId: string, volume: number): Promise<void> {
  const preset = resolveSoundPreset(soundId)
  const level = Math.min(Math.max(volume, 0), 1)
  for (let i = 0; i < preset.beeps; i++) {
    await playTone(preset.frequency, level, BEEP_MS)
    if (i < preset.beeps - 1) await delay(BEEP_GAP_MS)
  }
}

/**
 * A freshly created offscreen document can exist before its script has
 * registered the message listener, which makes the first send fail with
 * "Could not establish connection". Retry once, and never let a failed sound
 * escape — the notification is fired alongside it and must still go out.
 */
async function sendToOffscreen(message: PlaySoundMessage): Promise<void> {
  const attempts = 2
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await browser.runtime.sendMessage(message)
      return
    } catch (error) {
      if (attempt === attempts - 1) {
        console.warn('[chronly] could not play sound in the offscreen document', error)
        return
      }
      await delay(RETRY_DELAY_MS)
    }
  }
}

export async function playAlarmSound(soundId: string, volume: number): Promise<void> {
  if ('offscreen' in browser) {
    // Sound is the redundant half of the firing path — the notification goes
    // out alongside it and must not be lost to an audio failure.
    try {
      await ensureOffscreenDocument()
    } catch (error) {
      console.warn('[chronly] could not open the offscreen audio document', error)
      return
    }
    await sendToOffscreen(buildPlaySoundMessage(soundId, volume))
    return
  }
  if (typeof AudioContext !== 'undefined') {
    await playPresetLocally(soundId, volume)
  }
}
