<script lang="ts">
  import { notificationAccess } from '../lib/ui/notificationAccess'
  import Icon from './Icon.svelte'
</script>

{#if $notificationAccess === 'denied'}
  <div class="warning" role="note" aria-labelledby="notifications-off-title">
    <span class="icon" aria-hidden="true"><Icon name="bell" size={16} /></span>
    <div>
      <p id="notifications-off-title" class="title">Notifications are off for Chronly</p>
      <p class="text">
        Alarms still ring and show up here, but no system notification will appear. Turn notifications back on for
        Chronly in your browser's settings.
      </p>
    </div>
  </div>
{/if}

<style>
  .warning {
    display: flex;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent);
    border-radius: var(--radius, 0.75rem);
    background: var(--warn-tint);
  }

  .icon {
    flex: 0 0 auto;
    margin-top: 0.1rem;
    color: var(--warn);
  }

  .title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 650;
  }

  .text {
    margin: 0.15rem 0 0;
    color: var(--fg-muted);
    font-size: 0.75rem;
  }
</style>
