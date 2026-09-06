import { access, readFile } from 'node:fs/promises'

async function readManifest(browser) {
  const path = `.output/${browser}-mv3/manifest.json`
  return JSON.parse(await readFile(path, 'utf8'))
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Manifest check failed: ${message}`)
}

const chrome = await readManifest('chrome')
const firefox = await readManifest('firefox')

for (const [name, manifest] of Object.entries({ chrome, firefox })) {
  assert(manifest.manifest_version === 3, `${name} must be Manifest V3`)
  assert(manifest.description.length <= 132, `${name} description must fit the store summary limit`)
  assert(!manifest.chrome_url_overrides?.newtab, `${name} must preserve the browser's default New Tab page`)
  assert(manifest.action?.default_popup === 'popup.html', `${name} must expose the popup`)
  assert(manifest.permissions.includes('alarms'), `${name} must request alarms permission`)
  assert(manifest.permissions.includes('notifications'), `${name} must request notifications permission`)
  assert(manifest.permissions.includes('storage'), `${name} must request storage permission`)
}

assert(chrome.permissions.includes('offscreen'), 'Chrome must request offscreen permission')
assert(chrome.background?.service_worker === 'background.js', 'Chrome must use the service worker background')
assert(await exists('.output/chrome-mv3/offscreen.html'), 'Chrome must include the offscreen document')

assert(!firefox.permissions.includes('offscreen'), 'Firefox must not request offscreen permission')
assert(firefox.background?.scripts?.includes('background.js'), 'Firefox must use the event-page background script')
assert(
  firefox.browser_specific_settings?.gecko?.data_collection_permissions?.required?.includes('none'),
  'Firefox must declare no data collection',
)
assert(!(await exists('.output/firefox-mv3/offscreen.html')), 'Firefox must exclude the offscreen document')

console.log('Manifest checks passed for Chrome and Firefox')
