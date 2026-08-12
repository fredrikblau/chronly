# Popup preview harness

Renders the popup UI in a plain browser tab, with `wxt/browser` aliased to an
in-memory stub. Useful for iterating on layout and styling without rebuilding
and reloading the extension.

```bash
npm run preview:popup
```

Storage is in-memory only, so nothing persists across a reload and the
background worker is not running — alarms and timers will not actually fire
here. Use a real unpacked build for anything behaviour-related.
