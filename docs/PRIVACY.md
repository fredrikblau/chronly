# Privacy Policy

Chronly has no account system, analytics, telemetry, or server. It does not
send your data to the project maintainers.

## What stays on your device

Alarms, timers, Pomodoro sessions, world clocks, and settings are stored with
the browser's extension storage. Larger operational data and uploaded
background image bytes use local storage; small settings and world-clock
preferences may use browser sync storage so the browser can sync them across
signed-in profiles. Chronly does not operate that sync service and websites
cannot read the extension storage. Chronly does not override the browser’s
New Tab page.

## User-initiated calendar export

Add to Calendar either opens a prefilled Google Calendar link or creates an
`.ics` file locally. Chronly does not call a calendar API or sign in for you;
any transmission happens only after you choose to continue in the calendar
service or import the file yourself.

## Permissions

| Permission                | Purpose                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `alarms`                  | Wakes the background process so alarms, timers, and Pomodoro phases can be reconciled after suspension or sleep. |
| `notifications`           | Shows system notifications when scheduled records are due.                                                       |
| `storage`                 | Persists records, settings, and world-clock preferences in browser extension storage.                            |
| `offscreen` (Chrome only) | Opens a hidden document briefly so Chrome can play an alarm tone from its background service worker.             |

Chronly requests no host permissions and does not include advertising or
tracking SDKs. Firefox does not receive the Chrome-only `offscreen` permission.

## Future features

Two-way calendar sync is not part of this release. If it is ever added, it
will be opt-in, request any additional permission at the time it is enabled,
and be documented here before release.

## Open source

The source is available for audit. If the implementation and this policy ever
disagree, please open an issue so the discrepancy can be corrected.
