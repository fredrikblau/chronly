import { describe, expect, it } from 'vitest'
import type { BackgroundConfig } from '../core/types'
import { accentFromCss, backgroundSurface, resolveCanvas, surfaceLuminance, surfaceOf } from './palette'

const background = (patch: Partial<BackgroundConfig>): BackgroundConfig => ({
  type: 'solid',
  value: '#0b0b0f',
  accentColor: '#8b7cf6',
  ...patch,
})

describe('surfaceLuminance', () => {
  it('reads a six-digit hex colour', () => {
    expect(surfaceLuminance('#000000')).toBe(0)
    expect(surfaceLuminance('#ffffff')).toBeCloseTo(1)
  })

  it('expands a three-digit hex colour', () => {
    expect(surfaceLuminance('#fff')).toBe(surfaceLuminance('#ffffff'))
    expect(surfaceLuminance('#000')).toBe(0)
  })

  it('ignores the alpha channel of an eight-digit hex colour', () => {
    expect(surfaceLuminance('#ffffff00')).toBeCloseTo(1)
  })

  it('reads rgb() and rgba() colours', () => {
    expect(surfaceLuminance('rgb(255, 255, 255)')).toBeCloseTo(1)
    expect(surfaceLuminance('rgba(0 0 0 / 0.5)')).toBe(0)
  })

  it('averages every stop of a gradient', () => {
    // One black stop and one white stop average to mid grey.
    expect(surfaceLuminance('linear-gradient(160deg, #000000, #ffffff)')).toBeCloseTo(0.5)
  })

  it('returns null for a value with no readable colour', () => {
    expect(surfaceLuminance('papayawhip')).toBeNull()
    expect(surfaceLuminance('')).toBeNull()
  })

  it('weights green above red above blue, as perception does', () => {
    const green = surfaceLuminance('#00ff00') ?? 0
    const red = surfaceLuminance('#ff0000') ?? 0
    const blue = surfaceLuminance('#0000ff') ?? 0
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
  })
})

describe('accentFromCss', () => {
  it('returns the solid colour unchanged', () => {
    expect(accentFromCss('#123456')).toBe('#123456')
  })

  it('averages readable gradient stops', () => {
    expect(accentFromCss('linear-gradient(90deg, #000000, #ffffff)')).toBe('#808080')
  })

  it('returns null for an unreadable background', () => {
    expect(accentFromCss('papayawhip')).toBeNull()
  })
})

describe('surfaceOf', () => {
  it('calls a dark colour dark and a light one light', () => {
    expect(surfaceOf('#0b0b0f', 'light')).toBe('dark')
    expect(surfaceOf('#fdf6e3', 'dark')).toBe('light')
  })

  it('falls back when the colour cannot be read', () => {
    expect(surfaceOf('papayawhip', 'light')).toBe('light')
    expect(surfaceOf('papayawhip', 'dark')).toBe('dark')
  })
})

describe('backgroundSurface', () => {
  it('measures a solid background', () => {
    expect(backgroundSurface(background({ value: '#101018' }))).toBe('dark')
    expect(backgroundSurface(background({ value: '#fdf6e3' }))).toBe('light')
  })

  it('measures the stops of a gradient background', () => {
    expect(
      backgroundSurface(background({ type: 'gradient', value: 'linear-gradient(160deg, #f7f7fb, #e6e6f2)' })),
    ).toBe('light')
    expect(
      backgroundSurface(background({ type: 'gradient', value: 'linear-gradient(135deg, #0f2027, #203a43)' })),
    ).toBe('dark')
  })

  it('reports an unreadable colour rather than guessing', () => {
    expect(backgroundSurface(background({ value: 'papayawhip' }))).toBe('unknown')
  })
})

describe('resolveCanvas', () => {
  it('lets the theme decide under the default background', () => {
    expect(resolveCanvas(background({}), 'light')).toEqual({
      surface: 'light',
      canvas: '#f6f6f9',
      followsBackground: false,
    })
    expect(resolveCanvas(background({}), 'dark').canvas).toBe('#0b0b0f')
  })

  it('paints a picked light gradient even under the dark theme, with dark text', () => {
    const sunset = background({ type: 'gradient', value: 'linear-gradient(135deg, #ff7e5f, #feb47b)' })
    expect(resolveCanvas(sunset, 'dark')).toEqual({ surface: 'light', canvas: sunset.value, followsBackground: true })
  })

  it('paints a picked dark colour under the light theme, with light text', () => {
    expect(resolveCanvas(background({ value: '#112233' }), 'light')).toMatchObject({
      surface: 'dark',
      canvas: '#112233',
    })
  })

  it('falls back to the theme when the colour cannot be read', () => {
    expect(resolveCanvas(background({ value: 'papayawhip' }), 'dark')).toMatchObject({
      surface: 'dark',
      canvas: '#0b0b0f',
    })
  })
})
