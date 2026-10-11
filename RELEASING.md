# Release checklist

Automated tests (`npm test`, `npm run test:e2e`) and CI cover most of this
project, but Manifest V3's background-suspension behavior needs human checks.
Run through this list before each stable or store release.

A GitHub test prerelease may stop after the automated items through
`npm run test:e2e`. Use an `-rc.N` tag, mark it as a prerelease, and name each
unfinished manual check in the release notes. Do not submit that build to a
store or label it stable.

## Every release

- [ ] Review the copy, privacy answers, reviewer notes, and asset status in
      [`docs/STORE_LISTING.md`](docs/STORE_LISTING.md).
- [ ] After UI changes, run `npm run build && npm run screenshots` to recapture
      `docs/assets/`, then `npm run assets:store` for the store images.
- [ ] `npm run check && npm run zip && npm run zip:firefox` all pass on the release machine.
- [ ] `npm run lint:firefox` reports zero Firefox artifact errors after
      `npm run zip:firefox` (the Svelte runtime may emit a non-failing generic
      `UNSAFE_VAR_ASSIGNMENT` warning).
- [ ] `npm run verify:manifests` passes after both browser builds.
- [ ] `npm run test:e2e` passes against a fresh `npm run zip`. It loads
      `.output/chrome-mv3/` into a real Chromium, so it needs a display; on a
      headless machine run it as `xvfb-run -a npm run test:e2e`.
      The suite drives every panel, watches alarms, timers, and Pomodoro phases
      fire through the background worker (notification, badge, and ringing
      banner), checks Chrome's `offscreen.html` audio document, and confirms a
      running timer survives force-closing the MV3 service-worker target.
- [ ] Service-worker suspension: load the built (not dev-mode) Chrome extension,
      start a countdown, open `chrome://extensions`, click "service worker" to
      inspect it, then force-stop it. Reopen the popup; the countdown must
      still show the correct remaining time.
- [ ] Chrome unpacked production smoke: load `.output/chrome-mv3/`, start a
      35-second countdown, and confirm one notification and sound. Dismiss it
      and confirm the sound stops. Repeat, and this time stop it with
      **Dismiss** in the popup's ringing banner. Chrome exempts unpacked
      extensions from its alarm floor, so this duration stays above the
      production limit instead of relying on that exemption.
- [ ] Chrome packed-install alarm floor: install a Web Store-signed candidate,
      an enterprise-installed CRX, or a local CRX on Linux. Do not use "Load
      unpacked" for this check. Start a 10-second countdown and confirm Chrome
      delivers one notification and sound after applying its 30-second floor;
      dismissing the notification must stop the sound.
- [ ] Sleep/wake reconciliation: set an alarm a few minutes out, put the
      computer to sleep past that time, wake it, and confirm one
      notification fires (not zero, not a replay).
- [ ] Firefox temporary smoke: load `.output/firefox-mv3/manifest.json` through
      `about:debugging` → "Load Temporary Add-on" and check the popup, alarm
      audio, and native New Tab page. Let a timer ring and let its
      notification time out: the sound must keep ringing until you click the
      notification or press **Dismiss** in the popup.
- [ ] Firefox restart: install an AMO-signed candidate in release Firefox, or
      install the unsigned ZIP through `about:addons` in a dedicated Developer
      Edition or Nightly profile with signature enforcement disabled. Confirm
      that records and settings survive a restart. Do not use that development
      profile as your main browser profile.
- [ ] Update `CHANGELOG.md`: move the `[Unreleased]` entries under a new
      version heading with today's date.
- [ ] Bump `version` in `package.json` to match that heading.
- [ ] Release it with the [Release workflow](.github/workflows/release.yml),
      in whichever way suits you. Use `v0.2.0`, or `v0.2.0-rc.1` for a
      prerelease:
  - Actions tab → **Release** → **Run workflow** on `main`, and type the tag.
  - Or push the tag: `git tag v0.2.0 && git push origin v0.2.0`.
  - Or publish a release with that new tag on GitHub; the zips are added to
    it.

  Each way re-runs the full CI suite, checks the tag matches `package.json`
  (and, if the tag already exists, that it points at the commit CI checked),
  and attaches the Chrome, Firefox, and source zips. A new release gets
  generated notes and is marked as a prerelease when the tag has a `-`
  suffix, with a line saying the manual checks have not been signed off. A
  draft only gets the zips; publish it yourself. Edit the notes afterwards to
  name any manual check still outstanding.

`npm run lint:firefox` checks the Firefox artifact, and `npm run test:firefox`
(also in CI) loads it into real Firefox and drives the popup: alarms, a timer
and an alarm ringing through the background page, Dismiss and Snooze from the
popup, Pomodoro phases, the stopwatch, world clocks, sound import, and
backgrounds. WebDriver may not navigate to `moz-extension://` pages directly,
so the suite opens the popup from Firefox's privileged chrome context.

Both suites also confirm a ring's audio element is really playing, keeps
playing, and stops on Snooze or Dismiss. They cannot hear the speakers or see
the desktop notification itself, so still run the Firefox temporary smoke
above by hand. Firefox unloads temporary add-ons at
restart; use a signed or development-edition install for the restart check.
