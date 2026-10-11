import { readable } from 'svelte/store'
import { browser } from 'wxt/browser'

export type NotificationAccess = 'granted' | 'denied' | 'unknown'

/**
 * Whether the browser lets Chronly show notifications. Chrome reports it (and
 * people can switch it off from a notification's own menu); Firefox does not,
 * so there it stays 'unknown' and nothing is shown.
 */
export const notificationAccess = readable<NotificationAccess>('unknown', (set) => {
  const api = browser.notifications
  const listener = (level: string) => set(level === 'denied' ? 'denied' : 'granted')
  try {
    void api.getPermissionLevel?.().then(listener, () => set('unknown'))
    api.onPermissionLevelChanged?.addListener(listener)
  } catch {
    set('unknown')
  }
  return () => {
    try {
      api.onPermissionLevelChanged?.removeListener(listener)
    } catch {
      // Nothing was registered.
    }
  }
})
