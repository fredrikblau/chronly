# Changelog

All notable changes to Chronly are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Digital and analog clocks with 12/24-hour, seconds, size, and contrast preferences.
- Saved world clocks with UTC offsets, time differences, and meeting
  planning.
- One-off and recurring alarms with redundant notification and audio firing,
  adjustable volume, test alerts, and snooze.
- Multiple persistent countdown timers and a lap-tracking stopwatch.
- Automatic Pomodoro phase cycling and local session statistics.
- Zero-permission Google Calendar links and `.ics` exports for alarms and
  Pomodoro phases.
- Light, dark, and automatic themes plus solid and preset/custom gradient
  backgrounds with optional automatic accent extraction.
- Chrome and Firefox Manifest V3 builds from one codebase.
- Alarm sounds can repeat until dismissed, with clearer sound choices and a
  dedicated, live-updating stopwatch tab.
- The browser’s default New Tab page is preserved; Chronly does not override it.
- Hovering the toolbar button names the next alarm ("next alarm tomorrow
  07:00 (Wake up)"), following the 12/24-hour setting.
- A ringing banner in the popup with Snooze, Pause, and Dismiss, and a toolbar
  badge while anything rings, so an alert can be stopped even where the system
  notification has no buttons (Firefox) or has been hidden.
- Alarms have an on/off switch and can be edited in place. A one-off alarm
  stays listed after it rings and can be switched back on.
- The Clock tab is now an overview of what rings next, running timers, the
  focus session, one-click quick timers, and saved world clocks.
- Tabs have icons and number-key shortcuts, and the popup reopens on the last
  tab used. The stopwatch answers to Space and L.
- World clocks accept city names as people type them, including major cities
  without a time zone of their own.
- Timers have an hours field and +1 minute; Pomodoro has Skip, today's count,
  and a 7-day chart.
- Accent swatches, an About section with project links, and backup export and
  import in Settings.
- Deleting an alarm, timer, world clock, or focus session offers Undo.
- Settings has an Alerts section: pick how long Snooze lasts (5 to 30 minutes),
  and turn on gentle wake to have alarms start quietly and rise to full volume
  over 30 seconds.
- Running timers show the time they end.
- <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> opens Chronly from any tab.
- The popup warns when notifications are turned off for Chronly.

### Fixed

- You see an accessible error when an alarm notification or sound preview fails,
  so you can fix browser access before relying on an alarm.
- Chronly blocks popup controls until saved data loads. Chronly removes editable
  fallback values and shows recovery guidance after a read failure.
- Stopwatch persistence recovers after a rejected save. Failed audio tasks
  release their playback ID for retry, and background listener logs name the failed action.
- Alarm, timer, and Pomodoro controls now keep draft values and show a retryable
  error when browser storage rejects a change. Timer restart uses one write, so
  a failed restart cannot remove the existing timer.
- Dismissing a notification now stops its sound and clears the alert even when
  record cleanup fails.
- Chronly serializes alarm, timer, and Pomodoro changes across popup and
  background contexts so concurrent edits, deletions, and delivery updates do
  not overwrite each other.
- Chronly serializes imported-sound changes so concurrent imports and removals
  preserve each file. If storage rejects removal, Chronly keeps the selected sound and shows a retryable error.
- Chronly serializes appearance updates so rapid changes preserve each setting.
  Range and colour controls write once per committed change and report storage errors.
- World-clock storage failures now keep entered values and show a retryable
  error instead of clearing unsaved input.
- Deleting an alarm, timer, or Pomodoro now clears its scheduled browser alarm,
  notification, and active sound.
- Repeated delivery of the same alert no longer starts overlapping sound loops.
- In 12-hour mode the AM/PM marker no longer wraps under the clock.
- Choosing a background that did not match the current theme silently did
  nothing; a chosen background now sets a readable text palette of its own.
- On Firefox, an alarm whose notification could not be shown (notifications
  blocked, Do Not Disturb) or that timed out stopped ringing at once, because
  Firefox reports every notification close as the user's. Only a click on the
  notification or Dismiss in the popup stops a Firefox alert now.
- A popup taller than its window no longer shows a horizontal scrollbar.
- Secondary text and accent-coloured text meet WCAG 2.1 AA contrast in both
  themes; an axe audit of every tab now runs in the end-to-end suite.
- Paused timers and switched-off or spent alarms no longer keep a scheduled
  browser wake-up.

### Changed

- The popup has a refreshed design built on shared theme tokens and an icon
  set, a fixed height with only the panel area scrolling, and the end-to-end
  suite now covers every feature in a real Chromium build. A Firefox smoke
  suite runs the Firefox package in real Firefox in CI.
