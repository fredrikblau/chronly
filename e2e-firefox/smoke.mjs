// Firefox end-to-end smoke tests: the built Firefox package, loaded as a
// temporary add-on into a real Firefox and driven through WebDriver.
//
//   npm run zip:firefox && npm run test:firefox
//
// Needs Firefox and geckodriver. Selenium Manager finds or downloads both; set
// FIREFOX_PATH and GECKODRIVER_PATH to use specific ones.
//
// Firefox does not let WebDriver navigate to moz-extension:// pages, so the
// popup is opened from the browser's privileged chrome context instead, which
// geckodriver allows when started with --allow-system-access.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Builder, By } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PACKAGE = join(ROOT, '.output', `chronly-${version}-firefox.zip`)
const ADDON_ID = '@chronly'
// Pinned so the popup URL is known before the add-on is installed.
const UUID = '6c3f2a90-1111-4222-8333-0123456789ab'
const POPUP = `moz-extension://${UUID}/popup.html`

if (!existsSync(PACKAGE)) {
  throw new Error(`No Firefox package at ${PACKAGE}. Run \`npm run zip:firefox\` first.`)
}

async function launch(allowSystemAccess = true) {
  const options = new firefox.Options()
    .addArguments('-headless')
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ [ADDON_ID]: UUID }))
    // Pinned so time-of-day assertions read the same on every machine.
    .setPreference('intl.locale.requested', 'en-US')
  if (process.env.FIREFOX_PATH) options.setBinary(process.env.FIREFOX_PATH)
  const service = new firefox.ServiceBuilder(process.env.GECKODRIVER_PATH || undefined)
  // geckodriver 0.36+ requires this before it will run chrome-context scripts;
  // older ones reject the flag, so fall back to launching without it.
  if (allowSystemAccess) service.addArguments('--allow-system-access')
  try {
    return await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build()
  } catch (error) {
    // An older geckodriver exits on the unknown flag without naming it, so any
    // failure here is retried once without it; a real problem fails again.
    if (allowSystemAccess) return launch(false)
    throw error
  }
}

async function openPopup(driver) {
  await driver.installAddon(PACKAGE, true)
  const before = new Set(await driver.getAllWindowHandles())
  await driver.setContext(firefox.Context.CHROME)
  await driver.executeScript(
    `gBrowser.selectedTab = gBrowser.addTab(arguments[0], {
       triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
     })`,
    POPUP,
  )
  await driver.setContext(firefox.Context.CONTENT)
  const handle = (await driver.getAllWindowHandles()).find((h) => !before.has(h))
  await driver.switchTo().window(handle)
  await waitFor(driver, async () => (await driver.getCurrentUrl()) === POPUP, 'popup to open')
  await waitFor(driver, async () => (await tab(driver, 'clock').getAttribute('disabled')) === null, 'saved data')
}

function waitFor(driver, condition, what, timeout = 15_000) {
  return driver.wait(
    async () => {
      try {
        return Boolean(await condition())
      } catch {
        return false
      }
    },
    timeout,
    `Timed out waiting for ${what}`,
  )
}

const tab = (driver, id) => driver.findElement(By.id(`tab-${id}`))
const panel = (driver, id) => driver.findElement(By.id(`panel-${id}`))

async function openTab(driver, id) {
  await tab(driver, id).click()
  return panel(driver, id)
}

/** A visible button by its accessible label or its text. */
function button(scope, name) {
  return scope.findElement(
    By.xpath(`.//button[(@aria-label=${xpathString(name)} or normalize-space(.)=${xpathString(name)})]`),
  )
}

function xpathString(value) {
  return value.includes("'") ? `"${value}"` : `'${value}'`
}

async function fill(element, value) {
  await element.clear()
  await element.sendKeys(value)
}

/** Run an extension API call in the popup and return its result. */
function ext(driver, body, ...args) {
  return driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     (async (...args) => { ${body} })(...Array.from(arguments).slice(0, -1)).then(done, (e) => done({ error: String(e) }))`,
    ...args,
  )
}

const readRecords = async (driver) =>
  Object.values((await ext(driver, `return (await browser.storage.local.get('records')).records ?? {}`)) ?? {})

async function seedRecord(driver, record) {
  await ext(
    driver,
    `const [record] = args
     const { records = {} } = await browser.storage.local.get('records')
     await browser.storage.local.set({ records: { ...records, [record.id]: record } })`,
    record,
  )
}

function baseRecord(kind, label, now) {
  return {
    id: `${kind}-ff-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label,
    soundId: 'default',
    volume: 0.05,
    notified: false,
    createdAt: now,
    updatedAt: now,
  }
}

const ringingBanner = (driver, title) =>
  driver.findElements(By.xpath(`//*[@role='alert'][.//p[normalize-space(.)=${xpathString(title)}]]`))

describe('Chronly in Firefox', () => {
  let driver

  beforeEach(async () => {
    driver = await launch()
    await openPopup(driver)
  })

  afterEach(async () => {
    await driver?.quit()
  })

  test('renders every tab and a live clock', async () => {
    const tabs = await driver.findElements(By.css('[role=tab]'))
    assert.deepEqual(await Promise.all(tabs.map((t) => t.getText())), [
      'Clock',
      'Alarms',
      'Timers',
      'Stopwatch',
      'World',
      'Focus',
      'Settings',
    ])
    const clock = panel(driver, 'clock').findElement(By.css('[role=timer]'))
    const first = await clock.getText()
    assert.match(first, /^\d\d:\d\d:\d\d$/)
    await waitFor(driver, async () => (await clock.getText()) !== first, 'the clock to tick', 3000)
  })

  test('creates, switches off, and deletes an alarm, keeping browser.alarms in step', async () => {
    const alarms = await openTab(driver, 'alarms')
    await fill(alarms.findElement(By.css('input[placeholder="Label"]')), 'Firefox alarm')
    await button(alarms, 'Add alarm').click()
    const scheduled = () =>
      ext(driver, `return (await browser.alarms.getAll()).filter((a) => a.name.startsWith('record:')).length`)
    await waitFor(driver, async () => (await scheduled()) === 1, 'the alarm to be scheduled')

    await alarms.findElement(By.css('[role=switch][aria-label="Firefox alarm alarm"]')).click()
    await waitFor(driver, async () => (await scheduled()) === 0, 'the wake-up to be cleared')
    assert.equal((await readRecords(driver))[0].enabled, false)

    await button(alarms, 'Delete alarm Firefox alarm').click()
    await waitFor(driver, async () => (await readRecords(driver)).length === 0, 'the alarm to be deleted')
  })

  test('a finished timer rings through the background page and Dismiss in the popup stops it', async () => {
    const timers = await openTab(driver, 'timers')
    await fill(timers.findElement(By.css('input[aria-label="Minutes"]')), '0')
    await fill(timers.findElement(By.css('input[aria-label="Seconds"]')), '2')
    await fill(timers.findElement(By.css('input[placeholder="Label"]')), 'Firefox tea')
    await button(timers, 'Start').click()

    await waitFor(driver, async () => (await ringingBanner(driver, 'Firefox tea')).length === 1, 'the ringing banner')
    assert.equal(await ext(driver, `return browser.action.getBadgeText({})`), '!')
    const [timer] = await readRecords(driver)
    assert.equal(timer.status, 'completed')

    const [banner] = await ringingBanner(driver, 'Firefox tea')
    await button(banner, 'Dismiss Firefox tea').click()
    await waitFor(driver, async () => (await ringingBanner(driver, 'Firefox tea')).length === 0, 'the banner to clear')
    await waitFor(driver, async () => (await readRecords(driver)).length === 0, 'the finished timer to be removed')
    assert.equal(await ext(driver, `return browser.action.getBadgeText({})`), '')
  })

  test('a due alarm snoozes from the popup banner', async () => {
    const now = Date.now()
    const alarm = {
      ...baseRecord('alarm', 'Firefox ring', now),
      targetTimestamp: now + 2000,
      recurrence: null,
      fullScreenTakeover: false,
      snoozedUntil: null,
      enabled: true,
    }
    await seedRecord(driver, alarm)

    await waitFor(driver, async () => (await ringingBanner(driver, 'Firefox ring')).length === 1, 'the alarm to ring')
    const [banner] = await ringingBanner(driver, 'Firefox ring')
    await button(banner, 'Snooze 5 min Firefox ring').click()

    await waitFor(driver, async () => (await ringingBanner(driver, 'Firefox ring')).length === 0, 'the banner to clear')
    const [snoozed] = await readRecords(driver)
    assert.equal(snoozed.notified, false)
    assert.ok(snoozed.snoozedUntil > Date.now() + 4 * 60_000)
  })

  test('a Pomodoro focus phase advances on its own and is counted', async () => {
    const now = Date.now()
    await seedRecord(driver, {
      ...baseRecord('pomodoro', 'Firefox focus', now),
      phase: 'focus',
      cycleCount: 0,
      config: { focusMs: 25 * 60_000, shortBreakMs: 5 * 60_000, longBreakMs: 15 * 60_000, cyclesBeforeLongBreak: 4 },
      targetTimestamp: now + 2000,
      status: 'running',
      remainingMsAtPause: null,
    })

    await waitFor(driver, async () => (await readRecords(driver))[0]?.phase === 'shortBreak', 'the break to start')
    const stats = await ext(driver, `return (await browser.storage.local.get('pomodoroStats')).pomodoroStats`)
    assert.equal(stats.totalFocusSessionsCompleted, 1)
  })

  test('the stopwatch runs, laps, and keeps its state', async () => {
    const stopwatch = await openTab(driver, 'stopwatch')
    await button(stopwatch, 'Start').click()
    await driver.sleep(300)
    await button(stopwatch, 'Lap').click()
    await button(stopwatch, 'Pause').click()
    const laps = await stopwatch.findElements(By.css('ol[aria-label="Recorded laps"] li'))
    assert.equal(laps.length, 1)
    const stored = await ext(driver, `return (await browser.storage.local.get('stopwatch')).stopwatch`)
    assert.equal(stored.status, 'paused')
    assert.equal(stored.laps.length, 1)
  })

  test('world clocks accept a city name', async () => {
    const world = await openTab(driver, 'world')
    await fill(world.findElement(By.css('input[aria-label="Time zone"]')), 'new york')
    await button(world, 'Add').click()
    await waitFor(
      driver,
      async () => (await world.findElements(By.xpath(`.//li[contains(., 'America/New_York')]`))).length === 1,
      'New York to be added',
    )
  })

  test('imports a custom sound', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chronly-ff-'))
    const file = join(dir, 'firefox-bell.wav')
    writeFileSync(file, Buffer.from('RIFF-fake-audio'))
    const alarms = await openTab(driver, 'alarms')
    await alarms.findElement(By.css('input[aria-label="Import an audio file"]')).sendKeys(file)
    await waitFor(
      driver,
      async () => (await alarms.findElements(By.xpath(`.//option[normalize-space(.)='firefox-bell']`))).length === 1,
      'the imported sound to be listed',
    )
  })

  test('a picked background paints with a readable palette', async () => {
    const settings = await openTab(driver, 'settings')
    await settings.findElement(By.xpath(`.//label[contains(@class,'option')][normalize-space(.)='Dark']`)).click()
    await button(settings, 'Sunset').click()
    await waitFor(
      driver,
      async () =>
        (await driver.executeScript(`return document.documentElement.style.getPropertyValue('--bg')`)).includes(
          '#ff7e5f',
        ),
      'the gradient to paint',
    )
    assert.equal(await driver.findElement(By.css('.app')).getAttribute('data-surface'), 'light')
  })
})
