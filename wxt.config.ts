import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'Chronly',
    description:
      'A fast, private, open-source clock: world clocks, alarms, timers, and Pomodoro that actually work.',
    permissions: ['alarms', 'notifications', 'storage', ...(browser === 'chrome' ? ['offscreen'] : [])],
    browser_specific_settings: {
      gecko: {
        id: '@chronly',
        // Firefox's AMO consent model requires an explicit declaration for
        // new extensions. Chronly has no server and transmits no user data.
        data_collection_permissions: { required: ['none'] },
      },
    },
  }),
})
