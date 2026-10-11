# Roadmap

Chronly v1 focuses on dependable clocks, world clocks, alarms, timers, and
Pomodoro sessions. The items below are deliberately deferred so the core can
remain small, private, and reliable.

## Two-way Google Calendar sync

An isolated, opt-in integration could create, update, and delete calendar
events and optionally show upcoming events. It must request its own permission
only when enabled and must not affect core alarm reliability.

## Floating mini-timer overlay

An always-on-top or picture-in-picture-style countdown needs a separate UX and
browser-compatibility design for Chrome and Firefox.

## Optional Pomodoro distraction blocker

An opt-in site blocker would require a different permission footprint and a
careful one-session allowlist, so it remains separate from the v1 timer.

## Translations and saved profiles

Chronly is English-only. Translations need the UI strings moved behind
`browser.i18n` first; that groundwork is a good self-contained contribution.
Named theme and background profiles could follow once the settings model has
more real-world feedback.

## Full-tab alarm takeover

The design allows an optional takeover page for alarms, but v1 currently uses
audio and system notifications only. A future implementation should reuse the
existing firing path rather than create a second scheduler.

## Live toolbar countdown

The toolbar badge already marks a ringing alert. A live nearest-alarm or timer
countdown on it needs a foreground update strategy, because the background
worker intentionally wakes at a 30-second cadence. It should be designed before
being added so the displayed countdown is not misleading.

## Drag-and-drop world clocks

World clocks reorder with up and down buttons today. Drag-and-drop would be
quicker with a mouse, as long as keyboard reordering keeps working.
