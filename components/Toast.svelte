<script lang="ts">
  import { isTyping } from '../lib/ui/keyboard'
  import { dismissToast, holdToast, releaseToast, showToast, toast } from '../lib/ui/toast'
  import Icon from './Icon.svelte'

  let busy = $state(false)

  async function act() {
    const current = $toast
    if (!current?.action || busy) return
    busy = true
    try {
      await current.action()
      dismissToast(current.id)
    } catch {
      showToast('Could not undo that. Try again.')
    } finally {
      busy = false
    }
  }

  /** Ctrl+Z (⌘Z on a Mac) undoes while the message is up, outside text fields. */
  function onWindowKeydown(event: KeyboardEvent) {
    if (!$toast?.action || event.key.toLowerCase() !== 'z' || event.shiftKey || event.altKey) return
    if (!(event.ctrlKey || event.metaKey) || isTyping(event.target)) return
    event.preventDefault()
    void act()
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="toast-region"
  role="status"
  aria-live="polite"
  onpointerenter={holdToast}
  onpointerleave={releaseToast}
  onfocusin={holdToast}
  onfocusout={releaseToast}
>
  {#if $toast}
    <div class="toast">
      <span class="message">{$toast.message}</span>
      {#if $toast.actionLabel}
        <button
          type="button"
          class="btn btn-sm action"
          disabled={busy}
          aria-keyshortcuts="Control+Z Meta+Z"
          onclick={() => void act()}
        >
          {$toast.actionLabel}
        </button>
      {/if}
      <button type="button" class="icon-btn close" aria-label="Close message" onclick={() => dismissToast()}>
        <Icon name="close" size={14} />
      </button>
    </div>
  {/if}
</div>

<style>
  .toast-region {
    position: absolute;
    right: 0.875rem;
    bottom: 0.875rem;
    left: 0.875rem;
    z-index: 5;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 100%;
    padding: 0.4rem 0.4rem 0.4rem 0.85rem;
    border: 1px solid var(--hairline);
    border-radius: 0.8rem;
    background: var(--overlay);
    box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.6);
    color: var(--fg);
    font-size: 0.82rem;
    pointer-events: auto;
    animation: rise 160ms var(--ease, ease-out);
  }

  .message {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action {
    border-color: transparent;
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-weight: 650;
  }

  .close {
    width: 1.75rem;
    height: 1.75rem;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
