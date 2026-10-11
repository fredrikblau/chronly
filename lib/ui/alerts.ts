import { readable } from 'svelte/store'
import { browser } from 'wxt/browser'
import { buildAlertActionMessage } from '../core/alerts'
import type { AlertAction } from '../core/notifications'
import { ACTIVE_ALERTS_KEY, ActiveAlertStore, createExtensionStorageBackend, watchStorageKey } from '../core/storage'
import type { ActiveAlert } from '../core/types'

const store = new ActiveAlertStore(createExtensionStorageBackend('session'))

/**
 * What is ringing right now. Deliberately outside the popup's load gate: the
 * ringing banner is a convenience on top of the notification, and a failed read
 * here must never lock someone out of their alarms.
 */
export const activeAlerts = readable<ActiveAlert[]>([], (set) => {
  store.getAll().then(set, (error: unknown) => console.warn('[chronly] could not read ringing alerts', error))
  return watchStorageKey<Record<string, ActiveAlert>>(ACTIVE_ALERTS_KEY, (value) =>
    set(Object.values(value ?? {}).sort((a, b) => a.firedAt - b.firedAt)),
  )
})

/** Ask the background to snooze, pause, or dismiss a ringing alert. */
export async function sendAlertAction(recordId: string, action: AlertAction): Promise<void> {
  const ok: unknown = await browser.runtime.sendMessage(buildAlertActionMessage(recordId, action))
  if (ok === false) throw new Error('The background could not complete that action')
}
