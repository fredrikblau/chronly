import { defineConfig } from '@playwright/test'

/**
 * `npm run screenshots` regenerates the README and store screenshots from the
 * built extension, so they never drift from the real UI. Run `npm run build`
 * first. Kept apart from the e2e suite: these write files rather than assert.
 */
export default defineConfig({
  testDir: './scripts/screenshots',
  timeout: 60_000,
  reporter: 'list',
  use: { headless: false },
})
