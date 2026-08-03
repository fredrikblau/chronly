# Chronly — Clock/Alarm/Timer/Pomodoro Browser Extension Design

Status: proposed
Date: 2026-08-03

## 1. Summary

Chronly is an open-source, privacy-first browser extension that replaces the
New Tab page with a clean clock dashboard and provides a toolbar popup
"control center" for world clocks, alarms, timers, stopwatch, and Pomodoro
sessions. It targets Chrome/Chromium browsers and Firefox from one codebase.

The competitor landscape (researched across 20+ existing clock/world-clock/
alarm/timer/Pomodoro extensions) is fragmented and unreliable: alarms that
silently never fire, timers that reset when a tab closes, artificial limits
that shrink over time, feature-bloated or abandoned extensions, and at least
one extension that hijacks the default search engine. Chronly's core bet is
that shipping one coherent, actually-reliable product with a genuinely
minimal permissions footprint is a bigger differentiator than any single
feature.

## 2. Goals / Non-Goals

**Goals (v1):**
- One well-designed extension covering clock, world clocks, alarms,
  timer/stopwatch, and Pomodoro — no companion extensions, no bolted-on
  feature bloat.
- Alarms/timers that are provably reliable across service-worker suspension,
  browser restart, and system sleep/wake.
- A calm, modern, dark-first visual design that reads as premium, not
  templated.
- Zero tracking, zero ads, zero accounts, an itemized minimal-permissions
  list.
- Chrome/Chromium and Firefox support from a single codebase.
- A README, contribution setup, and repo scaffolding good enough to attract
  outside contributors from day one.

**Non-goals (v1 — explicitly deferred, see §9 Roadmap):**
- Weather, quotes, to-do lists, or other new-tab "dashboard bloat" widgets.
- Website/distraction blocking (Pomodoro is a timer, not a blocker).
- Page-content time scanning (à la "Auto Time Zone Converter").
- Any account system or server backend for core functionality.
- Two-way Google Calendar sync (v1 ships a zero-permission calendar export
  instead; see §6.6).

## 3. Competitive Positioning

Research findings that directly shape this design (full detail in the
research artifacts referenced by this spec's commit):

- **Reliability is the #1 unmet need.** Nearly every surveyed alarm/timer
  extension has review threads about alarms that "never ring," timers that
  silently reset, or a changelog admission of "twenty bugs including three
  that could stop a timer ringing." This is the single biggest wedge — see
  §7 for the architecture that avoids it.
- **Fragmentation over consolidation.** Users maintain multiple single-purpose
  extensions (a clock extension, a separate world-clock extension, a separate
  Pomodoro extension) or install anti-patterns like split "Big Clock | Hour"
  + "Big Clock | Minute" companion extensions. Chronly consolidates.
- **Broken trust patterns.** A 10k-install "World Clock Tab" extension
  silently switches the default search provider to Bing. World Time Buddy is
  "just a bookmark" to a paywalled website. The Marinara Pomodoro lineage is
  fragmented across delisted originals and several confusingly-named forks
  with inconsistent paywalls. Chronly competes by being boringly trustworthy:
  one canonical listing, an itemized permissions list, nothing installed
  behind the scenes.
- **Artificial limits erode goodwill.** Competitors cap free world clocks at
  4–5 and have shrunk that cap over time. Chronly has no caps.
- **Readability and working customization are recurring gaps.** "Numbers too
  small to read" is the most repeated complaint on the market-leading clock
  extension; background-image customization is broken in two other
  competitors for years running. Chronly's typography and background/theme
  system must actually work.
- **No competitor offers a true meeting-planner mode** (type/scrub a target
  time, see it translated live across every saved zone) inside the popup
  itself, despite it being explicitly requested. This is a concrete feature
  win, not just a polish win.

## 4. Branding

- **Name:** Chronly ("chron-" for time + a plain, human, non-corporate
  suffix). Short, ownable, easy to say ("install Chronly"), reads as an
  independent open-source project rather than a corporate product. Trivial
  to rename later if a naming conflict turns up — this is not a costly
  commitment.
- **Tagline:** "The clock extension that just works." Reinforces the
  reliability positioning directly.
- **License:** MIT. Maximizes adoption and ease of contribution; no
  copyleft friction for anyone who wants to fork, package, or embed it.

## 5. Tech Stack & Repo Structure

- **Framework:** [WXT](https://wxt.dev) (a Vite-based web extension
  framework) + Svelte + TypeScript. WXT builds on the already-agreed
  Svelte/TypeScript/Vite stack and directly absorbs the cross-browser MV3
  pain points identified in research: per-browser manifest generation
  (`background.scripts` for Firefox vs `background.service_worker` for
  Chrome from shared source), dev-mode hot reload, and packaging separate
  Chrome/Firefox build artifacts. This removes a category of hand-rolled
  build plumbing that would otherwise be a barrier to outside contributors.
- **Repo layout:**
  ```
  entrypoints/
    background.ts        # shared service worker / event page entry
    popup/                # Svelte app: control center (alarms, timers,
                           # stopwatch, Pomodoro, world-clock planner)
    newtab/                # Svelte app: minimal clock dashboard
    offscreen/              # Chrome-only audio playback document
  lib/core/                # framework-agnostic, unit-tested logic
    time.ts                 # Intl-based timezone conversion/formatting
    scheduler.ts             # alarm/timer/pomodoro state machine
    storage.ts                # typed chrome.storage wrapper + migrations
    notifications.ts           # notification creation/action handling
    audio.ts                    # Chrome offscreen-doc vs Firefox audio shim
    calendar.ts                  # ICS + calendar "add event" link builders
    calendar-oauth.ts (later)     # isolated, optional Google sync module
  components/               # shared Svelte UI (ClockFace, WorldClockRow,
                             # AlarmForm, TimerRing, PomodoroCycle,
                             # ThemePicker, BackgroundPicker, ...)
  docs/                      # this spec, privacy policy, roadmap
  ```
- **Timezone data:** use the browser's native `Intl.DateTimeFormat` /
  `Intl` timezone APIs exclusively — never a bundled/static tzdata library.
  This directly avoids the stale-DST-rule bug class found in a competitor
  (incorrect Paraguay DST data shipped in the extension itself); the native
  API stays current with the browser/OS.

## 6. Features (v1)

### 6.1 Clock
Digital and analog display modes, 12/24-hour toggle, optional seconds,
oversized tabular-figure numerals with a size/contrast slider (directly
answers the most repeated competitor complaint: "numbers too small to
read"). Both modes must render correctly whether shown alone or together —
several competitors visibly break when both are enabled simultaneously.

### 6.2 World Clocks
- Unlimited saved zones, add/remove/reorder (drag-and-drop)/rename/recolor.
- Each zone shows current time, UTC offset, and a plain-text difference
  (e.g. "+5h35m, tomorrow") simultaneously — no competitor shows all three
  at once.
- **Meeting-planner mode:** type or scrub a target time and see it
  translated live across every saved zone, with the chosen time "frozen"
  until explicitly cleared (fixes the "resets when popup closes" complaint).
- No duplicate-zone entries; correct handling of 30/45-minute-offset zones.
- A compact strip of saved zones also renders on the New Tab dashboard
  beneath the main clock.

### 6.3 Alarms
- One-off and recurring (day-of-week) alarms with custom labels.
- Redundant firing: audio chime + OS notification + (optional) full-tab
  takeover fire together, so no single blocked channel causes a silent
  miss.
- Volume slider plus a one-click "test this alarm now" button, multiple
  sound choices — resolves the two opposite complaints found in research
  ("too loud" vs. "I never hear it").
- Snooze from the notification itself.
- Explicitly guaranteed to survive service-worker suspension, browser
  restart, and system sleep/wake (see §7).

### 6.4 Timer & Stopwatch
- Multiple concurrent countdown timers plus a stopwatch with laps.
- All timers persist across tab/browser restart (never resets silently).
- v1 ships the core timer/stopwatch only; the always-on-top floating
  mini-timer overlay some users explicitly requested is deferred to the
  roadmap (§9) since it needs its own design pass (window/PiP behavior
  differs meaningfully between Chrome and Firefox).

### 6.5 Pomodoro
- Configurable work/short-break/long-break durations.
- Fully automatic phase transitions on every OS (no manual "continue" click
  — a specific, named gap in a popular competitor on macOS).
- Local-only session history/stats (no account, no server).
- No distraction/site blocking in v1 (see Non-goals, §2); this is a
  different problem domain and would meaningfully expand the permissions
  footprint (`declarativeNetRequest`) for a feature not every user wants.

### 6.6 Calendar Export ("Add to Calendar")
Any alarm or Pomodoro session gets an "Add to Calendar" action that:
- Opens a prefilled Google Calendar event via Google's public
  `calendar.google.com/calendar/render` link, **and**
- Offers a downloadable `.ics` file for Outlook/Apple Calendar/anything
  else.

Both paths are pure client-side link/file generation — **no OAuth, no API
call, no new permission**. This fully satisfies "let me add this to Google
Calendar" for one-off use without touching the privacy-first permissions
story. True two-way sync (auto-create/update/delete as alarms change,
optionally show upcoming Calendar events on the dashboard) is scoped as an
isolated, explicitly opt-in module in the roadmap — see §9.

### 6.7 New Tab Dashboard
Deliberately minimal: big clock (center), world-clock strip, and small
quick-access controls into the alarm/timer/Pomodoro popup UI. Background is
customizable (solid color, gradient presets, custom gradient builder, or an
uploaded/URL image) with an accent color that can auto-extract from the
current background. No weather, quotes, to-do list, or link/shortcut grid —
staying clock-first is the point (see Non-goals).

### 6.8 Toolbar Popup
The full control center: create/manage alarms, timers, stopwatch, Pomodoro
sessions, and the world-clock meeting planner. Optional toolbar icon badge
showing a live countdown for the nearest active timer/alarm.

### 6.9 Cross-cutting: Theming & Settings
Light/dark/auto (system) theme, with dark as the default. Small settings
(theme, display prefs, world-clock list) sync via `chrome.storage.sync`;
larger data (Pomodoro history) stays in `chrome.storage.local`. A
reduced-motion/accessibility toggle disables background animation and digit
crossfade transitions.

## 7. Reliability Architecture (Manifest V3)

This is the section that directly encodes the #1 competitive differentiator.
Findings from technical research on MV3 service-worker behavior:

- **Never trust in-memory state.** Chrome MV3 service workers terminate
  after ~30s idle and wipe all in-memory variables, including any pending
  `setTimeout`/`setInterval`. Every timer/alarm/Pomodoro session is
  persisted as a record with an **absolute target end-timestamp**
  (`Date.now()`-based epoch ms), phase, and running/paused state in
  `chrome.storage`. Remaining/elapsed time is always computed as
  `targetTimestamp - Date.now()` at read time — never decremented from a
  counter.
- **One durable scheduler, not one alarm per timer.** A single recurring
  `chrome.alarms` entry (`periodInMinutes: 0.5`, the real production floor —
  sub-30s intervals are silently floored) is the anchor. Its `onAlarm`
  handler reads all active records from storage and reacts to any that are
  due. This avoids Chrome's 500-active-alarm cap and the 30s-floor-per-alarm
  granularity problem that a naive "one alarm per timer" design would hit.
- **Idempotent, catch-up-safe firing.** Alarms carry no real-time precision
  guarantee and don't back-fill missed periodic occurrences after sleep. On
  every wake, the handler compares `Date.now()` against the persisted
  target and treats a completed/overdue timer as a one-time transition (a
  stored "notified" flag), so a laptop resuming from sleep 20 minutes late
  fires exactly one notification, not a replay.
- **Synchronous top-level listener registration.** `onAlarm`,
  `onMessage`, and `notifications.onClicked/onButtonClicked` are registered
  at the top level of the background script, not inside an async init
  function, so a worker woken specifically to deliver an event can't miss
  it.
- **Audio via offscreen document (Chrome) / direct playback (Firefox).**
  Service workers have no DOM, so Chrome alarm sound playback goes through a
  `chrome.offscreen` document created on demand (`AUDIO_PLAYBACK` reason).
  Firefox has no offscreen API; its event-page background script is a
  normal script context, so audio plays directly from there (verified per
  Firefox version) — abstracted behind a single `playAlarmSound()` function
  in `lib/core/audio.ts` so the rest of the codebase never branches on
  browser.
- **Foreground smoothing.** Any open popup/New Tab UI runs its own
  lightweight interval (200ms–1s) purely for visual smoothness, always
  re-deriving displayed time from the persisted absolute target — never
  drifting independently, and always re-syncing on reopen.
- **Explicit persistence guarantees.** Essential alarms are re-asserted in
  `runtime.onInstalled`/`onStartup` with an existence check, rather than
  assuming default persistence across restarts.
- **A published reliability claim.** Once the above is implemented and
  tested, the README states a concrete, testable guarantee (e.g. "alarms
  survive sleep, browser restart, and service-worker suspension — verified
  in CI and our pre-release checklist") — no competitor in this space makes
  or backs a claim like this.

Firefox-specific handling: the manifest declares both `background.scripts`
(Firefox) and `background.service_worker` (Chrome) from the same bundled
file (WXT handles this generation); `browser_specific_settings.gecko.id` is
set for AMO distribution; the callback-vs-Promise API difference is
normalized via `webextension-polyfill`.

## 8. Testing & Verification

- **Unit tests (Vitest)** for everything in `lib/core` that doesn't need a
  live browser: scheduler math, timezone/meeting-planner math, storage
  schema migrations, ICS/calendar-link generation.
- **A small number of true end-to-end smoke tests** loading the unpacked
  extension and exercising the golden paths (set an alarm, see it fire; add
  a world clock; run a Pomodoro cycle).
- **A documented pre-release checklist** for scenarios that are impractical
  to fully automate: manually suspending the service worker and confirming
  state reloads correctly from storage; testing against a packaged/zipped
  build (not just unpacked) to hit the real 30s alarm floor; simulating a
  system sleep/wake cycle and confirming exactly-once reconciliation;
  verifying the Firefox audio path specifically.
- **CI (GitHub Actions):** lint, typecheck, unit tests, and build for both
  the Chrome and Firefox targets on every pull request, wired to a real
  (non-decorative) status badge in the README.

## 9. Roadmap (explicitly deferred from v1)

Stated openly in the README/ROADMAP so contributors can see where help is
wanted:
- Two-way Google Calendar OAuth sync (isolated opt-in module: request the
  `identity` permission and calendar scope only when the user turns this on
  in settings; auto-create/update/delete calendar events as alarms change;
  optionally surface upcoming Calendar events on the dashboard). Kept
  strictly isolated from the core scheduler so declining or revoking it
  never affects core alarm reliability.
- Always-on-top floating mini-timer / picture-in-picture overlay.
- Optional Pomodoro distraction blocker (`declarativeNetRequest`-based,
  resistant to trivial devtools bypass) with a lightweight one-session
  allowlist exception.
- Additional locales/translations.
- Saved theme/background profiles ("Work" / "Night" / "Weekend").

## 10. Open Source Setup

- `LICENSE` (MIT) at repo root.
- `README.md`: one-sentence value prop above the fold, a real demo GIF/
  screenshot of the popup and New Tab UI, a <30s quick-start (Chrome Web
  Store + Firefox Add-ons links, plus "load unpacked"/"load temporary
  add-on" dev instructions), an itemized permissions-justification table,
  a feature-comparison table against named competitors, and shields.io
  badges (CI, version, license) wired to real CI.
- `CONTRIBUTING.md` (welcoming tone, browser-extension-specific dev setup),
  `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE/` (bug/feature/docs),
  `PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS`, optional `FUNDING.yml`.
- Semantic Versioning + `CHANGELOG.md` in "Keep a Changelog" format.
- A standalone plain-language privacy-policy page linked from the README
  and both store listings, turning the "no tracking/ads/accounts" claim
  into something verifiable rather than a slogan.
- GitHub repo metadata: About description, Topics
  (`browser-extension`, `chrome-extension`, `firefox-addon`, `pomodoro`,
  `alarm-clock`, `new-tab`), custom social-preview image.
- "Good first issue" labels seeded only on genuinely scoped, well-described
  tasks, with a commitment to fast first response on new issues/PRs.
- Growth sequencing (after the above is in place, not before): personal-
  network outreach for the first ~100 stars → submit to awesome-list repos
  → coordinated Show HN + Product Hunt window → relevant subreddits
  (respecting each community's self-promotion rules) → build-in-public
  posts → Chrome Web Store / Firefox Add-ons listing SEO.

## 11. Explicitly Out of Scope (v1)

Weather, quotes, to-do/notes widgets, website/distraction blocking, page-
content time scanning, any account system, analytics/telemetry of any kind,
two-way Google Calendar sync (ships as export-only, see §6.6).
