# Store submission brief

Use this copy for the Chrome Web Store and Firefox Add-ons listings. Update it
when product behavior, permissions, or screenshots change.

## Product details

**Name:** Chronly

**Summary (116 of 132 characters):**

> Private world clocks, alarms, timers, stopwatch laps, and Pomodoro sessions that keep working when the popup closes.

**Category:** Productivity

**Language:** English

**Detailed description:**

> Chronly puts clocks and time tools in your browser toolbar. It stores your
> data on your device and uses browser alarms to keep scheduled work running
> after you close the popup.
>
> - Check local time with digital and analog clock faces.
> - Save world clocks and compare working hours across time zones.
> - Schedule one-time or repeating alarms with built-in or imported sounds.
> - Run multiple countdowns and a stopwatch with lap splits.
> - Use configurable Pomodoro cycles and export sessions to your calendar.
> - Choose light or dark themes, gradients, text size, and reduced motion.
>
> Chronly requests no host permissions. It ships without accounts, ads,
> analytics, or remote code. You can inspect and contribute to the source at
> https://github.com/fredrikblau/chronly.

**Homepage:** https://github.com/fredrikblau/chronly

**Support:** https://github.com/fredrikblau/chronly/issues

**Privacy policy:** https://github.com/fredrikblau/chronly/blob/main/docs/PRIVACY.md

## Chrome privacy answers

**Single purpose:** Provide on-device clocks and scheduled time-management alerts.

**Data use:** Chronly sends no user data to the developer or third parties.
Browser sync may copy small settings and world-clock preferences between the
user's signed-in browser profiles. The browser provider operates that service.

**Remote code:** None. The package contains all executable code and bundled
sounds.

| Permission      | Dashboard justification                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `alarms`        | Wake the extension to reconcile alarms, timers, and Pomodoro phases.                   |
| `notifications` | Show a system alert when a scheduled record becomes due.                               |
| `storage`       | Save records, stopwatch state, imported sounds, statistics, and preferences.           |
| `offscreen`     | Let Chrome play alert audio because Manifest V3 service workers have no audio context. |

The extension requests no host permissions.

## Reviewer instructions

1. Open Chronly from the toolbar and confirm the live clock appears.
2. Open Alarms, create an alarm, then use **Test** to play its selected sound.
3. Open Timers, start a countdown, close the popup, and reopen it to confirm the timer continues.
4. Open Stopwatch, start it, close the popup, and confirm it resumes from stored state.
5. Open Settings and switch themes or choose a gradient.

Chrome creates `offscreen.html` after the reviewer tests audio. Firefox omits
the Chrome-only `offscreen` permission and plays audio from its background page.

## Listing assets

Run `npm run assets:store` to rebuild the generated images.

| Asset            | File                                             | Size     |
| ---------------- | ------------------------------------------------ | -------- |
| Store icon       | `public/icon-128.png`                            | 128×128  |
| Clock screenshot | `docs/store-assets/chrome-screenshot-clock.png`  | 1280×800 |
| Alarm screenshot | `docs/store-assets/chrome-screenshot-alarms.png` | 1280×800 |
| Small promo tile | `docs/store-assets/chrome-promo-small.png`       | 440×280  |
| Marquee promo    | `docs/store-assets/chrome-promo-marquee.png`     | 1400×560 |
| GitHub preview   | `docs/store-assets/github-social-preview.png`    | 1280×640 |

The screenshots embed current popup captures. Update
`docs/assets/popup-screenshot.png` and `docs/assets/alarms-screenshot.png`
before regeneration when the UI changes.

Repository admins upload `github-social-preview.png` from **Settings → General
→ Social preview**.

## Submission gates

- A maintainer must own and administer each store publisher account.
- Complete every manual check in [`RELEASING.md`](../RELEASING.md).
- Move the changelog entries into a dated version before tagging the release.
- Upload packages created from the tagged commit.

Chrome's current image and copy requirements:
[listing quality](https://developer.chrome.com/docs/webstore/best-listing),
[image sizes](https://developer.chrome.com/docs/webstore/images), and
[listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
