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

## Additional locales and saved profiles

Translations and named theme/background profiles are both useful follow-ups
once the base settings model has more real-world feedback.

## Full-tab alarm takeover

The design allows an optional takeover page for alarms, but v1 currently uses
audio and system notifications only. A future implementation should reuse the
existing firing path rather than create a second scheduler.

## Live toolbar badge

A live nearest-alarm/timer badge needs a foreground update strategy because the
background worker intentionally wakes at a 30-second cadence. It should be
designed before being added so the displayed countdown is not misleading.
