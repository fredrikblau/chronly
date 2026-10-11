import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const outputDir = new URL('../docs/store-assets/', import.meta.url)

async function dataUrl(path, mime = 'image/png') {
  return `data:${mime};base64,${(await readFile(new URL(path, import.meta.url))).toString('base64')}`
}

// The popup captures come from `npm run screenshots`; run that first so the
// store images show the current UI.
const [icon, promoIcon, clock, alarms, ringing, focus] = await Promise.all([
  dataUrl('../public/icon-128.png'),
  dataUrl('../assets/icon.svg', 'image/svg+xml'),
  dataUrl('../docs/assets/popup-screenshot.png'),
  dataUrl('../docs/assets/alarms-screenshot.png'),
  dataUrl('../docs/assets/ringing-screenshot.png'),
  dataUrl('../docs/assets/focus-screenshot.png'),
])

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
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
      .og { width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 470px; align-items: center; gap: 40px; padding: 0 72px 0 88px; overflow: hidden; }
      .og .brand { display: flex; align-items: center; gap: 22px; }
      .og .brand img { width: 92px; height: 92px; }
      .og h1 { margin: 0; font-size: 84px; line-height: 1; letter-spacing: -3.5px; }
      .og .lede { max-width: 600px; margin: 30px 0 0; color: #d6d0ec; font-size: 33px; line-height: 1.3; letter-spacing: -0.4px; }
      .og .pills { display: flex; gap: 12px; margin: 34px 0 0; padding: 0; list-style: none; }
      .og .pills li { padding: 9px 18px; border: 1px solid rgb(255 255 255 / 0.18); border-radius: 999px; background: rgb(255 255 255 / 0.06); color: #ece8fb; font-size: 21px; }
      .og .stack { position: relative; height: 640px; }
      .og .stack img { position: absolute; width: 330px; border: 1px solid rgb(255 255 255 / 0.14); border-radius: 22px; box-shadow: 0 30px 80px rgb(0 0 0 / 0.55); }
      .og .back { top: 64px; left: 120px; transform: rotate(5deg); opacity: 0.9; }
      .og .front { top: 96px; left: 0; transform: rotate(-3deg); }
      .listing { width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 480px; align-items: center; gap: 80px; padding: 48px 110px; }
      .copy img { width: 74px; height: 74px; }
      .copy h1 { max-width: 560px; margin: 28px 0 18px; font-size: 58px; line-height: 1.04; letter-spacing: -2.4px; }
      .copy p { max-width: 540px; margin: 0; color: #c9c3df; font-size: 24px; line-height: 1.45; }
      .shot { width: 480px; padding: 14px; border: 1px solid rgb(255 255 255 / 0.13); border-radius: 26px; background: rgb(255 255 255 / 0.07); box-shadow: 0 30px 80px rgb(0 0 0 / 0.45); }
      .shot img { display: block; width: 100%; height: auto; border-radius: 14px; }
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
// GitHub crops nothing but shows this small in feeds, so the copy is short and
// the popup does the talking.
await render(
  'github-social-preview.png',
  1280,
  640,
  `<main class="og">
     <section>
       <div class="brand"><img src="${promoIcon}" alt=""><h1>Chronly</h1></div>
       <p class="lede">Alarms, timers, and focus sessions in your browser that never miss a ring.</p>
       <ul class="pills"><li>Chrome &amp; Firefox</li><li>Open source</li><li>No tracking</li></ul>
     </section>
     <div class="stack">
       <img class="back" src="${focus}" alt="">
       <img class="front" src="${ringing}" alt="">
     </div>
   </main>`,
)
await render(
  'chrome-screenshot-clock.png',
  1280,
  800,
  `<main class="listing"><section class="copy"><img src="${icon}" alt=""><h1>Everything on the clock, one click away</h1><p>See what rings next, start a timer in one click, and glance at your world clocks.</p></section><div class="shot"><img src="${clock}" alt="Chronly clock popup"></div></main>`,
)
await render(
  'chrome-screenshot-alarms.png',
  1280,
  800,
  `<main class="listing"><section class="copy"><img src="${icon}" alt=""><h1>Alarms you can trust</h1><p>Repeat schedules, an on/off switch, eight built-in tones or your own audio, and ringing that waits for you.</p></section><div class="shot"><img src="${alarms}" alt="Chronly alarm controls"></div></main>`,
)

await render(
  'chrome-screenshot-ringing.png',
  1280,
  800,
  `<main class="listing"><section class="copy"><img src="${icon}" alt=""><h1>Never miss a ring</h1><p>Sound and a notification together, plus Snooze and Dismiss right in the popup, even on Firefox.</p></section><div class="shot"><img src="${ringing}" alt="Chronly ringing alarm banner"></div></main>`,
)
await render(
  'chrome-screenshot-focus.png',
  1280,
  800,
  `<main class="listing"><section class="copy"><img src="${icon}" alt=""><h1>Focus in rounds</h1><p>Pomodoro cycles that keep running in the background, with your sessions counted on your device.</p></section><div class="shot"><img src="${focus}" alt="Chronly Pomodoro timer"></div></main>`,
)

await browser.close()
console.log('Generated store and social assets in docs/store-assets')
