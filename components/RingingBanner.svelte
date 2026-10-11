<script lang="ts">
  import { ALERT_ACTION_LABELS, BANNER_ACTIONS, type AlertAction } from '../lib/core/notifications'
  import type { ActiveAlert } from '../lib/core/types'
  import { activeAlerts, sendAlertAction } from '../lib/ui/alerts'
  import { createNowStore } from '../lib/ui/now'
  import Icon from './Icon.svelte'

  /**
   * Shown at the top of the popup while anything rings. It matters most where
   * the system notification cannot help: Firefox shows no notification buttons,
   * and an OS can hide a notification while its sound keeps looping.
   */
  const now = createNowStore(10_000)
  let busy = $state<string | null>(null)
  let error = $state<string | null>(null)

  const KIND_LABELS: Record<ActiveAlert['kind'], string> = {
    alarm: 'Alarm',
    countdown: 'Timer',
    pomodoro: 'Focus',
  }

  function since(firedAt: number, at: number): string {
    const minutes = Math.floor((at - firedAt) / 60_000)
    if (minutes < 1) return 'just now'
    return minutes === 1 ? '1 min ago' : `${minutes} min ago`
  }

  async function act(alert: ActiveAlert, action: AlertAction) {
    busy = `${alert.recordId}:${action}`
    error = null
    try {
      await sendAlertAction(alert.recordId, action)
    } catch {
      error = 'Could not reach Chronly in the background. Close the notification, or try again.'
    } finally {
      busy = null
    }
  }
</script>

{#if $activeAlerts.length > 0}
  <section class="ringing" aria-label="Ringing now">
    {#each $activeAlerts as alert (alert.recordId)}
      <div class="alert" role="alert">
        <span class="bell" aria-hidden="true"><Icon name="bell" size={18} /></span>
        <div class="text">
          <p class="title">{alert.title}</p>
          <p class="meta">{KIND_LABELS[alert.kind]} · {alert.message} · {since(alert.firedAt, $now)}</p>
        </div>
        <div class="actions">
          {#each BANNER_ACTIONS[alert.kind] as action (action)}
            <button
              type="button"
              class="btn btn-sm"
              class:btn-primary={action === 'dismiss'}
              disabled={busy !== null}
              aria-label={`${ALERT_ACTION_LABELS[action]} ${alert.title}`}
              onclick={() => void act(alert, action)}
            >
              {ALERT_ACTION_LABELS[action]}
            </button>
          {/each}
        </div>
      </div>
    {/each}
    {#if error}<p class="error-text" role="status">{error}</p>{/if}
  </section>
{/if}

<style>
  .ringing {
    display: grid;
    gap: 0.4rem;
    padding: 0.625rem 0.875rem 0;
  }

  .alert {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.25rem 0.65rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--ring, #ff6b6b) 45%, transparent);
    border-radius: var(--radius, 0.75rem);
    background: color-mix(in srgb, var(--ring, #ff6b6b) 12%, var(--bg-solid, transparent));
  }

  .bell {
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 50%;
    background: var(--ring, #ff6b6b);
    color: #fff;
    animation: ring 1.4s ease-in-out infinite;
  }

  .text {
    min-width: 0;
  }

  .title {
    margin: 0;
    overflow: hidden;
    font-size: 0.9rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    margin: 0.1rem 0 0;
    color: var(--fg-muted);
    font-size: 0.72rem;
  }

  .actions {
    display: flex;
    grid-column: 1 / -1;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  @keyframes ring {
    0%,
    60%,
    100% {
      transform: rotate(0);
    }
    10%,
    30%,
    50% {
      transform: rotate(-14deg);
    }
    20%,
    40% {
      transform: rotate(14deg);
    }
  }
</style>
