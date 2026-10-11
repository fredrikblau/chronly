<script lang="ts">
  import { formatClockParts } from '../lib/ui/format'

  interface Props {
    now: number
    timeZone?: string
    hour12?: boolean
    showSeconds?: boolean
    mode?: 'digital' | 'analog' | 'both'
    contrast?: number
  }

  const {
    now,
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour12 = false,
    showSeconds = true,
    mode = 'digital',
    contrast = 1,
  }: Props = $props()

  const display = $derived(formatClockParts(new Date(now), timeZone, { hour12, showSeconds }))

  // The hands must follow the target zone, not the host machine's, so the
  // wall-clock parts are read back out of Intl rather than off the Date.
  const zonedParts = $derived(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(now)),
  )
  const part = (type: string) => Number(zonedParts.find((p) => p.type === type)?.value ?? 0)
  const hours = $derived(part('hour') % 12)
  const minutes = $derived(part('minute'))
  const seconds = $derived(part('second'))
  const hourAngle = $derived(hours * 30 + minutes * 0.5)
  const minuteAngle = $derived(minutes * 6 + seconds * 0.1)
  const secondAngle = $derived(seconds * 6)

  const TICKS = Array.from({ length: 60 }, (_, i) => i)
</script>

<div class="clock-face" class:both={mode === 'both'} style:--clock-contrast={contrast}>
  {#if mode === 'analog' || mode === 'both'}
    <svg class="analog" viewBox="0 0 100 100" aria-hidden="true" style:--clock-contrast={contrast}>
      <circle cx="50" cy="50" r="47" class="face" />
      {#each TICKS as tick (tick)}
        <line
          x1="50"
          y1={tick % 5 === 0 ? 7 : 6}
          x2="50"
          y2={tick % 5 === 0 ? 12 : 8.5}
          class="tick"
          class:major={tick % 5 === 0}
          transform={`rotate(${tick * 6} 50 50)`}
        />
      {/each}
      <line x1="50" y1="54" x2="50" y2="27" class="hand hour" transform={`rotate(${hourAngle} 50 50)`} />
      <line x1="50" y1="56" x2="50" y2="15" class="hand minute" transform={`rotate(${minuteAngle} 50 50)`} />
      {#if showSeconds}
        <line x1="50" y1="60" x2="50" y2="11" class="hand second" transform={`rotate(${secondAngle} 50 50)`} />
      {/if}
      <circle cx="50" cy="50" r="2.2" class="hub" />
    </svg>
  {/if}
  {#if mode === 'digital' || mode === 'both'}
    <div class="digital" role="timer" aria-live="off" style:--clock-contrast={contrast}>
      <span class="digits">{display.time}</span>{#if display.period}<span class="period">{display.period}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .clock-face {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  /*
    "Contrast" trades presence for calm: below 100% the clock recedes, above it
    the strokes thicken. A CSS contrast() filter would do almost nothing to
    near-white text on near-black, which is where this setting is most used.
  */
  .digital {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    opacity: min(1, var(--clock-contrast, 1));
    font-size: 4.5rem;
    font-weight: calc(250 + max(0, var(--clock-contrast, 1) - 1) * 500);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .both .digital {
    font-size: 2.25rem;
  }

  .period {
    color: var(--fg-muted, rgb(245 245 247 / 0.64));
    font-size: 0.3em;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .analog {
    width: 11.5rem;
    height: 11.5rem;
    opacity: min(1, var(--clock-contrast, 1));
  }

  .face {
    fill: var(--tint, rgb(255 255 255 / 0.045));
    stroke: var(--hairline, rgb(255 255 255 / 0.1));
    stroke-width: 1;
  }

  .tick {
    stroke: var(--fg-faint, rgb(245 245 247 / 0.38));
    stroke-width: 0.6;
    stroke-linecap: round;
  }

  .tick.major {
    stroke: var(--fg-muted, rgb(245 245 247 / 0.64));
    stroke-width: calc(1.4 * var(--clock-contrast, 1));
  }

  .hand {
    stroke: currentColor;
    stroke-linecap: round;
  }

  .hand.hour {
    stroke-width: calc(3.4 * var(--clock-contrast, 1));
  }

  .hand.minute {
    stroke-width: calc(2.2 * var(--clock-contrast, 1));
  }

  .hand.second {
    stroke: var(--accent, #8b7cf6);
    stroke-width: 1;
  }

  .hub {
    fill: var(--accent, #8b7cf6);
  }
</style>
