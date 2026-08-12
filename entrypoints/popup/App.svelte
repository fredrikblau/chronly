<script lang="ts">
  import ClockFace from '../../components/ClockFace.svelte'
  import { createNowStore } from '../../lib/ui/now'
  import { settings } from '../../lib/ui/settings'

  const now = createNowStore()
</script>

<div class="app" data-theme={$settings.theme}>
  <ClockFace
    now={$now}
    hour12={$settings.hour12}
    showSeconds={$settings.showSeconds}
    mode={$settings.clockMode}
  />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
  }

  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0b0b0f;
    color: #f5f5f7;
    font-family: system-ui, sans-serif;
  }
</style>
