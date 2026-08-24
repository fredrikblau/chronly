import type { BackgroundConfig } from '../core/types'

const IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'data:'])
// Semicolons are valid inside data URLs (for example `data:image/png;base64`)
// and cannot terminate the surrounding `url(...)` function on their own.
const UNSAFE_IN_URL = /[()\s"'\\{}<>]/

/**
 * Image settings are eventually interpolated into CSS `url(...)`. Validate at
 * the input boundary and again at render time because extension storage can
 * contain values written by an older version or edited through browser tools.
 */
export function isSafeImageUrl(value: string): boolean {
  const url = value.trim()
  if (!url || UNSAFE_IN_URL.test(url)) return false
  try {
    return IMAGE_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * Which way round a surface reads: 'dark' wants light text on it, 'light' wants
 * dark text.
 */
export type Surface = 'dark' | 'light'

const COLOR_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi

function parseColorChannels(css: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3})([0-9a-f])?$|^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(css)
  if (hex) {
    const short = hex[1]
    const digits = short ? [...short].map((c) => c + c).join('') : (hex[3] ?? '')
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(css)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

/**
 * Mean perceived brightness (0..1) of every colour a CSS value mentions, or
 * null when none of them can be read (a named CSS colour, say). Gradients carry
 * several stops; averaging them, and skipping the sRGB gamma ramp, is coarse but
 * enough to answer the only question being asked — is this surface dark or
 * light?
 */
export function surfaceLuminance(css: string): number | null {
  const matches = css.match(COLOR_PATTERN) ?? [css.trim()]
  const values = matches
    .map(parseColorChannels)
    .filter((channels): channels is [number, number, number] => channels !== null)
    .map(([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * How a CSS colour or gradient reads, falling back when it cannot be measured.
 * Used for anything painted under text that the user chose freely — a fill for
 * a button, say, where the label has to stay legible whatever the colour is.
 */
export function surfaceOf(css: string, fallback: Surface): Surface {
  const luminance = surfaceLuminance(css)
  if (luminance === null) return fallback
  return luminance < 0.5 ? 'dark' : 'light'
}

/**
 * How the configured background reads. The background is chosen independently
 * of the theme, so the theme on its own cannot decide the text colour — 'auto'
 * on a light desktop with the default near-black background would print black
 * on black. An image is unknowable, so it is treated as dark and expected to be
 * scrimmed; a colour that cannot be parsed is reported as 'unknown' and left to
 * the caller.
 */
export function backgroundSurface(background: BackgroundConfig): Surface | 'unknown' {
  if (background.type === 'image') return 'dark'
  const luminance = surfaceLuminance(background.value)
  if (luminance === null) return 'unknown'
  return luminance < 0.5 ? 'dark' : 'light'
}
