import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  zip: {
    includeSources: [
      'assets/**',
      'components/**',
      'entrypoints/**',
      'lib/**',
      'public/**',
      'package.json',
      'package-lock.json',
      'README.md',
      'tsconfig.json',
      'wxt.config.ts',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'Chronly',
    description:
      'Private world clocks, alarms, timers, stopwatch laps, and Pomodoro sessions that keep working when the popup closes.',
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
