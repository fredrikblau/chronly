import { browser } from 'wxt/browser'

export interface SoundPreset {
  id: string
  label: string
  frequency: number
  beeps: number
  description: string
  waveform: OscillatorType
  sourceUrl: string
}

const DEFAULT_PRESET: SoundPreset = {
  id: 'default',
  label: 'Morning bells',
  frequency: 659,
  beeps: 4,
  description: 'Warm rising bell melody',
  waveform: 'sine',
  sourceUrl: '/sounds/confirmation-1.ogg',
}

const SOUND_MELODIES: Record<string, number[]> = {
  default: [659, 784, 988, 784],
  gentle: [523, 659, 784],
  urgent: [880, 1175, 880, 1175, 1318],
  pulse: [392, 392, 523],
  crystal: [1047, 1319, 1568, 1319],
  marimba: [392, 494, 587, 494],
  starlight: [784, 988, 1175, 1568],
  double: [784, 784, 988, 988],
}

export const SOUND_PRESETS: SoundPreset[] = [
  DEFAULT_PRESET,
  { id: 'gentle', label: 'Soft sunrise', frequency: 523, beeps: 3, description: 'Quiet, gentle chimes', waveform: 'sine', sourceUrl: '/sounds/confirmation-2.ogg' },
  { id: 'urgent', label: 'Bright alert', frequency: 880, beeps: 5, description: 'Crisp repeating alert', waveform: 'square', sourceUrl: '/sounds/confirmation-3.ogg' },
  { id: 'pulse', label: 'Deep reminder', frequency: 392, beeps: 3, description: 'Low, steady reminder', waveform: 'triangle', sourceUrl: '/sounds/confirmation-4.ogg' },
  { id: 'crystal', label: 'Crystal drops', frequency: 1047, beeps: 4, description: 'Light, sparkling melody', waveform: 'sine', sourceUrl: '/sounds/open-1.ogg' },
  { id: 'marimba', label: 'Warm marimba', frequency: 392, beeps: 4, description: 'Rounded wooden notes', waveform: 'triangle', sourceUrl: '/sounds/open-2.ogg' },
  { id: 'starlight', label: 'Starlight', frequency: 784, beeps: 4, description: 'Airy, floating melody', waveform: 'sine', sourceUrl: '/sounds/open-3.ogg' },
  { id: 'double', label: 'Double tap', frequency: 784, beeps: 4, description: 'Short, friendly two-tone alert', waveform: 'triangle', sourceUrl: '/sounds/open-4.ogg' },
]

export function resolveSoundPreset(soundId: string): SoundPreset {
  return SOUND_PRESETS.find((p) => p.id === soundId) ?? DEFAULT_PRESET
}

export interface PlaySoundMessage {
  target: 'offscreen'
  type: 'play-sound'
  soundId: string
  volume: number
  playbackId: string
  loop: boolean
  audioDataUrl?: string
}

export interface StopSoundMessage {
  target: 'offscreen'
  type: 'stop-sound'
  playbackId: string
}

export function buildPlaySoundMessage(
  soundId: string,
  volume: number,
  playbackId = 'preview',
  loop = true,
  audioDataUrl?: string,
): PlaySoundMessage {
  return { target: 'offscreen', type: 'play-sound', soundId, volume, playbackId, loop, audioDataUrl }
}

export function buildStopSoundMessage(playbackId: string): StopSoundMessage {
  return { target: 'offscreen', type: 'stop-sound', playbackId }
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
    typeof candidate.volume === 'number' &&
    Number.isFinite(candidate.volume) &&
    candidate.volume >= 0 &&
    candidate.volume <= 1
    && typeof candidate.playbackId === 'string'
    && typeof candidate.loop === 'boolean'
    && (candidate.audioDataUrl === undefined || typeof candidate.audioDataUrl === 'string')
  )
}

export function isStopSoundMessage(message: unknown): message is StopSoundMessage {
  if (typeof message !== 'object' || message === null) return false
  const candidate = message as Partial<StopSoundMessage>
  return candidate.target === 'offscreen' && candidate.type === 'stop-sound' && typeof candidate.playbackId === 'string'
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

async function playTone(frequency: number, volume: number, durationMs: number, waveform: OscillatorType): Promise<void> {
  const context = new AudioContext()
  await context.resume().catch(() => undefined)
  await new Promise<void>((resolve) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime
    const end = start + durationMs / 1000
    // Never let the two ramps overlap, which would schedule the sustain point
    // before the attack finishes (or before `start`) for very short beeps.
    const ramp = Math.min(RAMP_S, durationMs / 2000)

    oscillator.type = waveform
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
  const melody = SOUND_MELODIES[preset.id] ?? [preset.frequency]
  for (let i = 0; i < preset.beeps; i++) {
    await playTone(melody[i % melody.length] ?? preset.frequency, level, BEEP_MS, preset.waveform)
    if (i < preset.beeps - 1) await delay(BEEP_GAP_MS)
  }
}

export function isSafeAudioDataUrl(value: string): boolean {
  return /^data:audio\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(value)
}

/**
 * A freshly created offscreen document can exist before its script has
 * registered the message listener, which makes the first send fail with
 * "Could not establish connection". Retry once, and never let a failed sound
 * escape — the notification is fired alongside it and must still go out.
 */
async function sendToOffscreen(message: PlaySoundMessage | StopSoundMessage): Promise<void> {
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

const localPlayback = new Map<string, { stopped: boolean }>()
const localAudio = new Map<string, HTMLAudioElement>()

export async function playAlarmSound(
  soundId: string,
  volume: number,
  playbackId = 'preview',
  loop = true,
  audioDataUrl?: string,
): Promise<void> {
  if ('offscreen' in browser) {
    // Sound is the redundant half of the firing path — the notification goes
    // out alongside it and must not be lost to an audio failure.
    try {
      await ensureOffscreenDocument()
    } catch (error) {
      // `getContexts` is an async IPC, so a stale zero-context reply can still
      // produce a duplicate createDocument. That means the document exists —
      // fall through and send rather than dropping the sound.
      console.warn('[chronly] offscreen document may already exist', error)
    }
    await sendToOffscreen(buildPlaySoundMessage(soundId, volume, playbackId, loop, audioDataUrl))
    return
  }
  if (localAudio.has(playbackId) || localPlayback.has(playbackId)) return
  const builtInAudioUrl = resolveSoundPreset(soundId).sourceUrl
  const playableAudioUrl = audioDataUrl && isSafeAudioDataUrl(audioDataUrl) ? audioDataUrl : builtInAudioUrl
  if (playableAudioUrl && typeof Audio !== 'undefined') {
    const audio = new Audio(playableAudioUrl)
    audio.volume = Math.min(Math.max(volume, 0), 1)
    audio.loop = loop
    localAudio.set(playbackId, audio)
    try {
      await audio.play()
      if (loop) await new Promise<void>((resolve) => audio.addEventListener('pause', () => resolve(), { once: true }))
      localAudio.delete(playbackId)
      return
    } catch {
      audio.pause()
      localAudio.delete(playbackId)
    }
  }
  if (typeof AudioContext !== 'undefined') {
    const playback = { stopped: false }
    localPlayback.set(playbackId, playback)
    do {
      await playPresetLocally(soundId, volume)
    } while (loop && !playback.stopped)
    localPlayback.delete(playbackId)
  }
}

export async function stopAlarmSound(playbackId: string): Promise<void> {
  const local = localPlayback.get(playbackId)
  if (local) local.stopped = true
  localAudio.get(playbackId)?.pause()
  localAudio.delete(playbackId)
  if ('offscreen' in browser) await sendToOffscreen(buildStopSoundMessage(playbackId))
}
