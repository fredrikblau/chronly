import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
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
  },
})
