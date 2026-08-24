import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import ClockFace from './ClockFace.svelte'

const NOON_UTC = new Date('2026-01-15T12:30:00.000Z').getTime()

describe('ClockFace', () => {
  it('renders the formatted digital time for the given zone', () => {
    render(ClockFace, { now: NOON_UTC, timeZone: 'UTC', hour12: false, showSeconds: false })
    expect(screen.getByRole('timer')).toHaveTextContent('12:30')
  })

  it('renders the same instant differently in another zone', () => {
    render(ClockFace, {
      now: NOON_UTC,
      timeZone: 'Asia/Tokyo',
      hour12: false,
      showSeconds: false,
    })
    expect(screen.getByRole('timer')).toHaveTextContent('21:30')
  })

  it('renders an analog face with no digital readout when mode is analog', () => {
    const { container } = render(ClockFace, { now: NOON_UTC, timeZone: 'UTC', mode: 'analog' })
    expect(container.querySelector('svg.analog')).not.toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('shows both faces in both mode', () => {
    const { container } = render(ClockFace, { now: NOON_UTC, timeZone: 'UTC', mode: 'both' })
    expect(container.querySelector('svg.analog')).not.toBeNull()
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('applies the configured contrast to the clock face', () => {
    const { container } = render(ClockFace, { now: NOON_UTC, contrast: 1.35 })
    expect(container.querySelector('.digital')).toHaveStyle('--clock-contrast: 1.35')
  })

  it('points the hands at the zoned time, not UTC', () => {
    const { container } = render(ClockFace, {
      now: NOON_UTC,
      timeZone: 'Asia/Tokyo', // 21:30 local
      mode: 'analog',
    })
    // 21:30 -> hour hand at 9h30m = 285deg, minute hand at 30m = 180deg.
    expect(container.querySelector('.hand.hour')?.getAttribute('transform')).toBe(
      'rotate(285 50 50)',
    )
    expect(container.querySelector('.hand.minute')?.getAttribute('transform')).toBe(
      'rotate(180 50 50)',
    )
  })
})
