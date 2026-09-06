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
