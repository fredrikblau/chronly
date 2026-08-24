# Release checklist

Automated tests (`npm test`, `npm run test:e2e`) and CI cover most of this
project, but Manifest V3's background-suspension behavior can't be fully
exercised by an automated test. Run through this list before every release
— it's short on purpose.

## Every release

- [ ] `npm run typecheck && npm run lint && npm test && npm run build && npm run build:firefox` all pass locally.
- [ ] `npm run lint:firefox` reports zero Firefox artifact errors after
      `npm run build:firefox` (the Svelte runtime may emit a non-failing generic
      `UNSAFE_VAR_ASSIGNMENT` warning).
- [ ] `npm run verify:manifests` passes after both browser builds.
- [ ] `npm run test:e2e` passes against a fresh `npm run build`. It loads
      `.output/chrome-mv3/` into a real Chromium, so it needs a display; on a
      headless machine run it as `xvfb-run -a npm run test:e2e`.
- [ ] Service-worker suspension: load the built (not dev-mode) Chrome extension,
      start a countdown, open `chrome://extensions`, click "service worker" to
      inspect it, then force-stop it. Reopen the popup — the countdown must
      still show the correct remaining time.
- [ ] Packaged-build alarm floor: with the same packaged build, confirm a
      short (10s) countdown's notification/sound still arrives correctly
      (may take up to ~30s, since a packaged MV3 build clamps `chrome.alarms`
      to a 30-second floor) rather than never firing.
- [ ] Sleep/wake reconciliation: set an alarm a few minutes out, put the
      computer to sleep past that time, wake it, and confirm exactly one
      notification fires (not zero, not a replay).
- [ ] Firefox: against the current `.output/firefox-mv3/` build, load the
      extension via `about:debugging` → "Load Temporary Add-on" and check the
      New Tab override, the popup, alarm audio, and that records and settings
      survive a browser restart.
- [ ] Update `CHANGELOG.md`: move the `[Unreleased]` entries under a new
      version heading with today's date.
- [ ] Bump `version` in `package.json` to match that heading.
- [ ] Tag the release and attach the zipped builds produced by `npm run zip`
      and `npm run zip:firefox` (both land in `.output/`).
