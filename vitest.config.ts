import { svelte } from '@sveltejs/vite-plugin-svelte'
import { configDefaults, defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  // WxtVitest supplies the extension-API mocks and WXT's aliases, but not the
  // Svelte compiler — @wxt-dev/module-svelte only wires that into the build.
  // Component tests need it here too.
  plugins: [svelte(), WxtVitest()],
  // Without the browser condition, Svelte 5 resolves to its server build and
  // mount() throws "not available on the server".
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // e2e/ holds Playwright specs, which match Vitest's default `*.spec.ts`
    // include and throw as soon as they are collected. `npm run test:e2e` owns
    // that directory.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
