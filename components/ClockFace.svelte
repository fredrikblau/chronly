<script lang="ts">
  import { formatTimeInZone } from '../lib/core/time'

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

  const display = $derived(formatTimeInZone(new Date(now), timeZone, { hour12, showSeconds }))

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
</script>

{#if mode === 'digital' || mode === 'both'}
  <div class="digital" role="timer" aria-live="off" style:--clock-contrast={contrast}>{display}</div>
{/if}
{#if mode === 'analog' || mode === 'both'}
  <svg class="analog" viewBox="0 0 100 100" aria-hidden="true" style:--clock-contrast={contrast}>
    <circle cx="50" cy="50" r="48" class="face" />
    <line
      x1="50"
      y1="50"
      x2="50"
      y2="26"
      class="hand hour"
      transform={`rotate(${hourAngle} 50 50)`}
    />
    <line
      x1="50"
      y1="50"
      x2="50"
      y2="16"
      class="hand minute"
      transform={`rotate(${minuteAngle} 50 50)`}
    />
    <line
      x1="50"
      y1="50"
      x2="50"
      y2="12"
      class="hand second"
      transform={`rotate(${secondAngle} 50 50)`}
    />
  </svg>
{/if}

<style>
  .digital {
    font-variant-numeric: tabular-nums;
    font-size: clamp(2.5rem, 15vw, 9rem);
    font-weight: 300;
    letter-spacing: 0.02em;
    filter: contrast(var(--clock-contrast, 1));
  }
  .analog {
    width: 12rem;
    height: 12rem;
    filter: contrast(var(--clock-contrast, 1));
  }
  .face {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    opacity: 0.4;
  }
  .hand {
    stroke: currentColor;
    stroke-linecap: round;
  }
  .hand.hour {
    stroke-width: 3;
  }
  .hand.minute {
    stroke-width: 2;
  }
  .hand.second {
    stroke-width: 1;
    opacity: 0.7;
  }
</style>
