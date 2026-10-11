import { test as base, chromium, type BrowserContext } from '@playwright/test'

// @types/node is not installed (this is a browser-extension project), so
// `__dirname` / `node:path` are unavailable here. Resolving against
// `import.meta.url` gets the same answer using only standard URL APIs.
const EXTENSION_PATH = decodeURIComponent(new URL('../.output/chrome-mv3', import.meta.url).pathname)

/**
 * The id Chromium gave the unpacked extension. Usually read off the background
 * service worker's URL, but Playwright occasionally misses a worker that starts
 * while the browser is still launching. Then ask chrome://extensions, which
 * lists installed extensions whether or not their worker has been seen.
 */
export async function extensionIdOf(context: BrowserContext): Promise<string> {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 5_000 }).catch(() => null))
  // chrome-extension://<id>/background.js — the id is the host segment.
  if (worker) return new URL(worker.url()).host

  const page = await context.newPage()
  try {
    await page.goto('chrome://extensions')
    const id = await page.evaluate(async () => {
      const api = (globalThis as unknown as DeveloperPrivateHost).chrome.developerPrivate
      return (await api.getExtensionsInfo()).find(({ name }) => name === 'Chronly')?.id
    })
    if (!id) throw new Error('Chronly is not installed in this browser profile')
    return id
  } finally {
    await page.close()
  }
}

interface DeveloperPrivateHost {
  chrome: { developerPrivate: { getExtensionsInfo(): Promise<Array<{ id: string; name: string }>> } }
}

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured-args form to detect fixture dependencies.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      // Lets contributors reuse a Chromium they already have instead of
      // downloading Playwright's pinned build.
      executablePath: process.env.CHROMIUM_PATH || undefined,
      // Pinned so time-of-day assertions read the same on every machine.
      timezoneId: 'UTC',
      locale: 'en-US',
      // MV3 extensions only load into a persistent context, and only when
      // Chromium is told about them at launch.
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    })
    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context))
  },
})
