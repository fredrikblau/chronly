# Contributing to Chronly

Thanks for helping. Chronly is small enough to understand in an afternoon, and
every kind of contribution helps: bug reports, testing a build on your browser,
docs, design feedback, and code.

## Ways to help without writing code

- **Test a build.** Load a [release build](https://github.com/fredrikblau/chronly/releases)
  and try alarms, timers, and sleep and wake on your OS. Open a
  [browser test report](https://github.com/fredrikblau/chronly/issues/new/choose)
  with what you saw, even if everything worked.
- **Report a bug** with the steps, browser, and OS. A screenshot of the popup
  helps a lot.
- **Suggest a city** that the World tab should find by name.

## Set up in two minutes

You need Node 22 or newer (`.nvmrc` pins the version CI uses).

```bash
git clone https://github.com/fredrikblau/chronly.git
cd chronly
npm install
npm run dev              # opens Chrome with Chronly loaded and hot reload
npm run dev:firefox      # the same for Firefox
```

For quick visual work, `npm run preview:popup` renders the popup in an
ordinary browser tab with in-memory storage. Nothing fires there, so use the
real extension for anything to do with timing.

## Before you open a pull request

```bash
npm run check            # typecheck, lint, format check, unit and component tests
```

`npm run format` fixes formatting. If you changed how the extension behaves in
a browser, also run the end-to-end suite:

```bash
npm run build
npm run test:e2e         # on headless Linux: xvfb-run -a npm run test:e2e
```

Playwright downloads its own Chromium on first use (`npx playwright install
chromium`). If you already have a Chromium, point the suite at it instead:
`CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

## Where things go

- **Behaviour** (when things ring, what a record becomes) belongs in
  `lib/core/`, as plain functions with Vitest tests next to them.
- **Display** belongs in `components/`. Panels read storage through the stores
  in `lib/ui/` and never talk to the background directly; the one exception is
  the ringing banner's alert-action message.
- **Styles:** use the tokens and primitives in `entrypoints/popup/theme.css`
  (`.btn`, `.btn-primary`, `.input`, `.switch`, `.card`, `.panel-head`) and keep
  a component's own `<style>` for layout.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the popup, the
background worker, and storage fit together.

## Recipes

**Add a city the World tab can find by name.** Add a lower-case entry to
`lib/core/cityAliases.ts` mapping the city to the IANA zone it keeps time with,
and add a case to the `resolveTimeZone` tests in `lib/core/time.test.ts`. Only
cities that are not already the last part of a zone id need an entry.

**Add an icon.** Add a key to `ICONS` in `components/Icon.svelte`, drawn on a
24×24 grid with strokes. Use it as `<Icon name="your-key" />`.

**Add a bundled sound.** Put a short CC0 OGG in `public/sounds/`, add a preset
to `SOUND_PRESETS` in `lib/core/audio.ts`, and credit it in
`docs/ASSET_LICENSES.md`.

**Add a setting.** Add the field and default to `Settings` and
`DEFAULT_SETTINGS` in `lib/core/types.ts`, validate it in `readSettings` in
`lib/core/backup.ts`, add a control to `components/ThemePicker.svelte`, and add
a test next to the existing ones.

**Change a screenshot.** Run `npm run build && npm run screenshots` to
regenerate everything in `docs/assets/` from the real UI, then
`npm run assets:store` for the store images. Commit the PNGs that changed.

## Code style

- Prettier and ESLint decide formatting; run `npm run format` rather than
  arguing with them.
- Import browser APIs explicitly: `import { browser } from 'wxt/browser'`.
  WXT helpers such as `defineBackground` are the intended exception.
- Comments explain why something non-obvious is the way it is, not what the
  next line does.
- Behaviour changes come with tests. User-facing changes update the README or
  docs when they describe that behaviour.

## Privacy is a feature

Please don't add telemetry, accounts, remote code, broad host permissions, or
bundled time-zone offset data without opening an issue first. Any new
permission has to be justified in the README, `docs/PRIVACY.md`, and
`docs/STORE_LISTING.md`.

## Commits and pull requests

- Explain why in the commit message; the diff already shows what.
- Keep unrelated cleanup out of feature changes.
- Fill in the pull-request template. Draft PRs are welcome for early feedback.
- Open an issue before large architectural changes so we can agree on the
  approach first.

## Questions and conduct

Ask in [Discussions](https://github.com/fredrikblau/chronly/discussions) or on
an issue. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
