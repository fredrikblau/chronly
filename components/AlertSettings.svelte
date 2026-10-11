<script lang="ts">
  import type { Settings } from '../lib/core/types'
  import { settings, settingsActions } from '../lib/ui/settings'

  const SNOOZE_CHOICES = [5, 10, 15, 20, 30]

  let error = $state<string | null>(null)

  function update(patch: Partial<Settings>) {
    void settingsActions.update(patch).then(
      () => (error = null),
      () => (error = 'Could not save alert settings. Try again.'),
    )
  }
</script>

<section class="panel" aria-labelledby="alert-settings-heading">
  <header class="panel-head">
    <h2 id="alert-settings-heading">Alerts</h2>
  </header>

  <div class="group">
    <span id="snooze-label" class="field-label">Snooze for</span>
    <div class="segmented" role="group" aria-labelledby="snooze-label">
      {#each SNOOZE_CHOICES as minutes (minutes)}
        <button
          type="button"
          aria-pressed={$settings.snoozeMinutes === minutes}
          aria-label={`Snooze for ${minutes} minutes`}
          onclick={() => update({ snoozeMinutes: minutes })}
        >
          {minutes} min
        </button>
      {/each}
    </div>
  </div>

  <label class="toggle card">
    <span class="toggle-text">
      <span>Gentle wake</span>
      <small id="hint-gentle-wake">Alarms start quietly and rise to full volume over 30 seconds</small>
    </span>
    <input
      type="checkbox"
      role="switch"
      class="switch"
      aria-label="Gentle wake"
      aria-describedby="hint-gentle-wake"
      checked={$settings.gentleWake}
      onchange={(e) => update({ gentleWake: e.currentTarget.checked })}
    />
  </label>

  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    width: 100%;
    color: var(--fg, #f5f5f7);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    cursor: pointer;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
  }

  .toggle-text small {
    color: var(--fg-muted);
    font-size: 0.72rem;
  }
</style>
