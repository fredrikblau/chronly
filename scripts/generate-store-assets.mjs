import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const outputDir = new URL('../docs/store-assets/', import.meta.url)

async function dataUrl(path, mime = 'image/png') {
  return `data:${mime};base64,${(await readFile(new URL(path, import.meta.url))).toString('base64')}`
}

const [icon, promoIcon, clock, alarms] = await Promise.all([
  dataUrl('../public/icon-128.png'),
  dataUrl('../assets/icon.svg', 'image/svg+xml'),
  dataUrl('../docs/assets/popup-screenshot.png'),
  dataUrl('../docs/assets/alarms-screenshot.png'),
])

const browser = await chromium.launch()
const page = await browser.newPage()

async function render(filename, width, height, body) {
  await page.setViewportSize({ width, height })
  await page.setContent(`<!doctype html>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body {
        overflow: hidden;
        color: #f8f7ff;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background:
          radial-gradient(circle at 15% 15%, rgb(167 139 250 / 0.34), transparent 34%),
          linear-gradient(135deg, #171326, #0b0b0f 66%);
      }
      .promo { width: 100%; height: 100%; display: grid; place-items: center; background: radial-gradient(circle, rgb(124 92 220 / 0.55), transparent 58%); }
      .promo img { width: 176px; height: 176px; }
      .promo.small img { width: 128px; height: 128px; }
      .social { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: 56px; padding: 96px; }
      .social img { width: 192px; height: 192px; }
      .social h1 { margin: 0; font-size: 96px; line-height: 1; letter-spacing: -4px; }
      .social p { margin: 18px 0 0; color: #c9c3df; font-size: 30px; }
      .listing { width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 520px; align-items: center; gap: 80px; padding: 64px 110px; }
      .copy img { width: 74px; height: 74px; }
      .copy h1 { max-width: 560px; margin: 28px 0 18px; font-size: 58px; line-height: 1.04; letter-spacing: -2.4px; }
      .copy p { max-width: 540px; margin: 0; color: #c9c3df; font-size: 24px; line-height: 1.45; }
      .shot { width: 520px; padding: 20px; border: 1px solid rgb(255 255 255 / 0.13); border-radius: 28px; background: rgb(255 255 255 / 0.07); box-shadow: 0 30px 80px rgb(0 0 0 / 0.45); }
      .shot img { display: block; width: 480px; height: 520px; }
    </style>${body}`)
  await page.screenshot({ path: fileURLToPath(new URL(filename, outputDir)) })
}

await mkdir(outputDir, { recursive: true })

await render(
  'chrome-promo-small.png',
  440,
  280,
  `<main class="promo small"><img src="${promoIcon}" alt="Chronly"></main>`,
)
await render('chrome-promo-marquee.png', 1400, 560, `<main class="promo"><img src="${promoIcon}" alt="Chronly"></main>`)
await render(
  'github-social-preview.png',
  1280,
  640,
  `<main class="social"><img src="${promoIcon}" alt=""><section><h1>Chronly</h1><p>Private time tools for Chrome and Firefox</p></section></main>`,
)
await render(
  'chrome-screenshot-clock.png',
  1280,
  800,
  `<main class="listing"><section class="copy"><img src="${icon}" alt=""><h1>Your clocks, one click away</h1><p>Local time, world clocks, alarms, timers, stopwatch laps, and focus sessions.</p></section><div class="shot"><img src="${clock}" alt="Chronly clock popup"></div></main>`,
)
await render(
  'chrome-screenshot-alarms.png',
  1280,
  800,
  `<main class="listing"><section class="copy"><img src="${icon}" alt=""><h1>Alarms you can trust</h1><p>Repeat schedules, eight built-in tones, imported audio, snooze, and ringing that waits for dismissal.</p></section><div class="shot"><img src="${alarms}" alt="Chronly alarm controls"></div></main>`,
)

await browser.close()
console.log('Generated store and social assets in docs/store-assets')
