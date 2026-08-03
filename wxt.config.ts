import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'Chronly',
    description:
      'A fast, private, open-source clock: world clocks, alarms, timers, and Pomodoro that actually work.',
    permissions: ['alarms', 'notifications', 'storage', ...(browser === 'chrome' ? ['offscreen'] : [])],
    browser_specific_settings: {
      gecko: { id: '@chronly' },
    },
  }),
})
