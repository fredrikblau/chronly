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
  if (url.toLowerCase().startsWith('data:')) {
    const comma = url.indexOf(',')
    if (comma < 0) return false
    const metadata = url.slice(5, comma)
    const mediaType = metadata.split(';', 1)[0]?.toLowerCase()
    // Raster data is self-contained and inert as a CSS background. SVG and
    // non-image data URLs can carry markup or an unexpected document type.
    return Boolean(mediaType?.startsWith('image/') && mediaType !== 'image/svg+xml')
  }
  try {
    return IMAGE_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** Check file bytes as well as the browser-supplied MIME label. */
export async function isRasterImageFile(file: File): Promise<boolean> {
  const type = file.type.toLowerCase()
  const allowed = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
    'image/x-icon',
  ])
  if (!allowed.has(type)) return false

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const text = new TextDecoder().decode(bytes).trimStart().toLowerCase()
  if (text.startsWith('<') || text.includes('<svg')) return false

  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (type === 'image/png') return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  if (type === 'image/jpeg') return startsWith(0xff, 0xd8, 0xff)
  if (type === 'image/gif') return text.startsWith('gif87a') || text.startsWith('gif89a')
  if (type === 'image/bmp') return text.startsWith('bm')
  if (type === 'image/x-icon') return startsWith(0x00, 0x00, 0x01, 0x00)
  if (type === 'image/webp') return text.startsWith('riff') && text.slice(8, 12) === 'webp'
  return text.slice(4, 8) === 'ftyp' && (text.slice(8, 12) === 'avif' || text.slice(8, 12) === 'avis')
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

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.max(0, Math.min(255, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** Return a representative accent for a solid colour or CSS gradient. */
export function accentFromCss(css: string): string | null {
  const matches = css.match(COLOR_PATTERN) ?? [css.trim()]
  const values = matches
    .map(parseColorChannels)
    .filter((channels): channels is [number, number, number] => channels !== null)
  if (values.length === 0) return null
  const average: [number, number, number] = [
    values.reduce((sum, [r]) => sum + r, 0) / values.length,
    values.reduce((sum, [, g]) => sum + g, 0) / values.length,
    values.reduce((sum, [, , b]) => sum + b, 0) / values.length,
  ]
  return toHex(average)
}

/**
 * Extract a representative colour from a locally uploaded raster image. URL
 * images are deliberately excluded: fetching them here would add a second
 * network request and would make the privacy warning in the settings panel
 * misleading.
 */
export function accentFromLocalImage(dataUrl: string): Promise<string | null> {
  if (!dataUrl.startsWith('data:image/')) return Promise.resolve(null)
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve(null)
      return
    }
    const image = new Image()
    image.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          resolve(null)
          return
        }
        context.drawImage(image, 0, 0, size, size)
        const pixels = context.getImageData(0, 0, size, size).data
        let red = 0
        let green = 0
        let blue = 0
        let weight = 0
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = (pixels[index + 3] ?? 0) / 255
          red += (pixels[index] ?? 0) * alpha
          green += (pixels[index + 1] ?? 0) * alpha
          blue += (pixels[index + 2] ?? 0) * alpha
          weight += alpha
        }
        resolve(weight === 0 ? null : toHex([red / weight, green / weight, blue / weight]))
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
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
