<script lang="ts">
  import { browser } from 'wxt/browser'
  import { BackupError, createBackup, parseBackup, planImport } from '../lib/core/backup'
  import type { AlarmRecord } from '../lib/core/types'
  import { recordActions, records } from '../lib/ui/records'
  import { settings, settingsActions } from '../lib/ui/settings'
  import { worldClockActions, worldClocks } from '../lib/ui/worldClocks'
  import Icon from './Icon.svelte'

  const REPO = 'https://github.com/fredrikblau/chronly'

  const version = (() => {
    try {
      return browser.runtime.getManifest().version
    } catch {
      return ''
    }
  })()

  const SHORTCUTS = [
    { keys: 'Alt+Shift+K', action: 'Open Chronly from anywhere' },
    { keys: '1 – 7', action: 'Switch tab' },
    { keys: '← →', action: 'Move between tabs' },
    { keys: 'Space', action: 'Start or pause the stopwatch' },
    { keys: 'L', action: 'Record a stopwatch lap' },
    { keys: 'Ctrl+Z', action: 'Undo a delete (⌘Z on a Mac)' },
  ]

  let fileInput: HTMLInputElement
  let busy = $state(false)
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const alarms = $derived($records.filter((r): r is AlarmRecord => r.kind === 'alarm'))

  function exportBackup() {
    const backup = createBackup({ settings: $settings, worldClocks: $worldClocks, alarms }, Date.now())
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `chronly-backup-${new Date().toISOString().slice(0, 10)}.json`
    // Firefox only dispatches the download for an anchor that is in the document.
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    message = { kind: 'ok', text: `Exported ${alarms.length} alarms and ${$worldClocks.length} world clocks.` }
  }

  async function importBackup() {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    busy = true
    message = null
    try {
      const plan = planImport(parseBackup(await file.text()), { worldClocks: $worldClocks, alarms }, Date.now())
      await settingsActions.update(plan.settings)
      for (const entry of plan.worldClocks) await worldClockActions.upsert(entry)
      for (const alarm of plan.alarms) await recordActions.upsert(alarm)
      const skipped = plan.skippedAlarms + plan.skippedWorldClocks
      message = {
        kind: 'ok',
        text:
          `Imported ${plan.alarms.length} alarms and ${plan.worldClocks.length} world clocks` +
          (skipped ? `; skipped ${skipped} already saved.` : '.'),
      }
    } catch (error) {
      message = {
        kind: 'error',
        text: error instanceof BackupError ? error.message : 'Could not import that backup. Try again.',
      }
    } finally {
      busy = false
    }
  }
</script>

<section class="about" aria-labelledby="about-heading">
  <div class="panel-head">
    <h2 id="about-heading">About</h2>
    {#if version}<span class="panel-meta">Version {version}</span>{/if}
  </div>

  <div class="brand card">
    <img src="/icon-48.png" alt="" width="40" height="40" />
    <div>
      <p class="name">Chronly</p>
      <p class="hint">Open source and private: no account, no tracking, no server.</p>
    </div>
  </div>

  <div class="links">
    <a class="btn" href={REPO} target="_blank" rel="noopener noreferrer"><Icon name="star" /> Star on GitHub</a>
    <a class="btn" href={`${REPO}/issues/new/choose`} target="_blank" rel="noopener noreferrer">
      <Icon name="bug" /> Report a problem
    </a>
    <a class="btn" href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer">
      <Icon name="github" /> Contribute
    </a>
    <a class="btn" href={`${REPO}/blob/main/docs/PRIVACY.md`} target="_blank" rel="noopener noreferrer">
      <Icon name="shield" /> Privacy
    </a>
  </div>

  <div class="group">
    <h3 class="section-title">Backup</h3>
    <p class="hint">Save your alarms, world clocks, and appearance to a file, or bring them back on another browser.</p>
    <div class="row">
      <button type="button" class="btn" disabled={busy} onclick={exportBackup}>
        <Icon name="download" /> Export
      </button>
      <button type="button" class="btn" disabled={busy} onclick={() => fileInput.click()}>
        <Icon name="upload" />
        {busy ? 'Importing…' : 'Import'}
      </button>
      <input
        bind:this={fileInput}
        class="sr-only"
        type="file"
        accept="application/json,.json"
        aria-label="Import a Chronly backup file"
        tabindex="-1"
        onchange={() => void importBackup()}
      />
    </div>
    {#if message}
      <p
        class={message.kind === 'error' ? 'error-text' : 'hint ok'}
        role={message.kind === 'error' ? 'alert' : 'status'}
      >
        {message.text}
      </p>
    {/if}
  </div>

  <div class="group">
    <h3 class="section-title">Keyboard</h3>
    <dl class="keys">
      {#each SHORTCUTS as shortcut (shortcut.keys)}
        <div>
          <dt><kbd>{shortcut.keys}</kbd></dt>
          <dd>{shortcut.action}</dd>
        </div>
      {/each}
    </dl>
  </div>
</section>

<style>
  .about {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .brand img {
    border-radius: 0.6rem;
  }

  .name {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
  }

  .links {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }

  .links .btn {
    justify-content: flex-start;
    text-decoration: none;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .group h3 {
    margin: 0.25rem 0 0;
  }

  .row {
    display: flex;
    gap: 0.35rem;
  }

  .ok {
    color: var(--success);
  }

  .keys {
    display: grid;
    gap: 0.3rem;
    margin: 0;
  }

  .keys div {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    align-items: center;
    font-size: 0.8rem;
  }

  .keys dt,
  .keys dd {
    margin: 0;
  }

  .keys dd {
    color: var(--fg-muted);
  }

  kbd {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--hairline);
    border-bottom-width: 2px;
    border-radius: 0.35rem;
    background: var(--tint);
    font-family: inherit;
    font-size: 0.72rem;
  }
</style>
