import { test as base, chromium, type BrowserContext } from '@playwright/test'

// @types/node is not installed (this is a browser-extension project), so
// `__dirname` / `node:path` are unavailable here. Resolving against
// `import.meta.url` gets the same answer using only standard URL APIs.
const EXTENSION_PATH = decodeURIComponent(new URL('../.output/chrome-mv3', import.meta.url).pathname)

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured-args form to detect fixture dependencies.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      // MV3 extensions only load into a persistent context, and only when
      // Chromium is told about them at launch.
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    })
    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    // The worker may not have spun up yet on a cold profile.
    const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    // chrome-extension://<id>/background.js — the id is the host segment.
    const id = new URL(background.url()).host
    if (!id) throw new Error(`Could not read an extension id from ${background.url()}`)
    await use(id)
  },
})
