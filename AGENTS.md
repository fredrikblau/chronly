# Notes for AI coding agents

Human contributors: [CONTRIBUTING.md](CONTRIBUTING.md) has everything here and more.

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing anything in
  `entrypoints/background.ts` or `lib/core/`.
- Behaviour lives in `lib/core/` as pure functions with Vitest tests beside
  them; Svelte components only render and call those functions.
- Import browser APIs from `wxt/browser`. Unit tests use
  `@webext-core/fake-browser`, reset with `fakeBrowser.reset()` in `beforeEach`.
- Style with the tokens and classes in `entrypoints/popup/theme.css`.
- Run `npm run check` before finishing. For extension wiring or user flows, also
  run `npm run build && npm run test:e2e` (prefix `xvfb-run -a` on headless
  Linux; set `CHROMIUM_PATH` to reuse an installed Chromium), and
  `npm run zip:firefox && npm run test:firefox` for Firefox.
- Never add telemetry, accounts, host permissions, or remote code.
