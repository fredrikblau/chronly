import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    // Chromium only loads extensions with a real (or virtual, via xvfb) display;
    // the headless shell has no extension support.
    headless: false,
    // On failure, keep a trace to open with `npx playwright show-trace`.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
