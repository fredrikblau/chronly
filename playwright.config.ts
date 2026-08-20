import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: 'list',
  use: {
    // Chromium only loads extensions with a real (or virtual, via xvfb) display;
    // the headless shell has no extension support.
    headless: false,
  },
})
