# Contributing to Chronly

Thanks for helping make Chronly reliable. Bug reports, browser testing,
documentation, translations, and code are all welcome.

## Setup

```bash
npm install
npm run dev
```

Use `npm run dev:firefox` to develop against Firefox. For a production-like
build, use `npm run build` or `npm run build:firefox`, then load the generated
`.output` directory in the browser's extension developer tools.

The popup and New Tab page can also be previewed without reloading an
extension: `npm run preview:popup` and `npm run preview:newtab`.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
```

Run `npm run test:e2e` when changing extension wiring or user-facing flows.
Behavior changes should include tests, and setup or user-facing changes should
update the relevant documentation.

## Project structure

`lib/core/` contains framework-independent scheduling, storage, timezone,
notification, audio, and calendar logic. `lib/ui/` contains thin reactive
wrappers, while `components/` and `entrypoints/` contain the Svelte surfaces
and extension entrypoints. Core behavior belongs in `lib/core/` and should be
covered by focused Vitest tests.

Use explicit imports for browser APIs (`import { browser } from 'wxt/browser'`).
The WXT entrypoint helpers such as `defineBackground` are the intended
exception. Keep comments focused on why a non-obvious choice exists.

## Commit and pull-request guidance

Explain the reason for a change in the commit message, keep unrelated cleanup
out of feature changes, and use the pull-request template. Please do not add
telemetry, accounts, tracking, broad host permissions, or bundled timezone data
without first discussing the design and privacy implications.

## Screenshots

The README intentionally does not contain fabricated screenshots. If you add
real captures, place them in `docs/assets/` and update the README links.

## Questions and conduct

Open an issue or discussion when the intended behavior is unclear. Please read
the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.
