# Readnote Atlas desktop captions

Keep bilingual captions visible while you work in other apps. This optional
macOS helper pairs with Readnote Atlas and displays a resizable, always-on-top
window, including when Chrome is minimized.

## Local setup

Requirements: macOS, Node.js, and Apple's Command Line Tools (`swiftc`).

1. Load/reload the Readnote Atlas extension and note its ID in `chrome://extensions`.
2. From the project root, pair that ID once:

   ```sh
   npm run desktop:captions -- --extension-id=YOUR_READNOTE_ATLAS_ID
   ```

3. Refresh existing YouTube tabs. Later starts use `npm run desktop:captions`;
   the paired extension ID is remembered locally. Keep this helper running.

Only one helper may listen on port 8792. Quitting it from the menu bar stops
the local service. This source distribution does not install a login item or
silently install a native app. A Chrome extension reload alone cannot launch
an uninstalled native helper.

## Behavior

- YouTube remains unchanged in the foreground. Leaving it during playback
  shows a single desktop caption panel (including when Chrome is minimized).
- Returning to the YouTube page hides the panel. Pausing an already-visible
  panel retains the last caption; X dismisses it until returning to YouTube.
- Hover reveals proportional rewind 15s / play-pause / forward 15s controls,
  plus the normal Atlas bookmark action. Rapid actions are queued and acknowledged.
- The graphite glass surface is draggable/resizable, left aligned, and auto-fits
  both languages with half-line spacing, in a borderless window.
- Once the native helper takes over a page session, browser PiP stays suppressed
  even through short network gaps. After quitting the helper, refresh YouTube
  to restore browser-only fallback.

## Local data and security

Only the exact paired Chrome extension origin can retrieve a local session.
Subsequent state and command requests require that session. The server binds
only to `127.0.0.1:8792`; ordinary web origins and unpaired extensions are rejected.
Session material and the paired ID live under ignored `dist/desktop-captions/`
and are never packaged. Live captions are held in memory, not written to disk.
No API keys, existing notes, or provider settings are migrated or overwritten.

## Quick troubleshooting

<details>
<summary>No captions after switching tabs or minimizing Chrome?</summary>

- Keep a captioned YouTube video playing and confirm Atlas's in-player bilingual captions work first.
- Confirm this helper is still running and paired with the installed **Readnote Atlas** extension ID.
- Refresh YouTube after pairing or reloading the extension.
- If port 8792 is already in use, quit the other caption helper before starting this one.
- If compilation fails, check that Apple's Command Line Tools provide `swiftc`.

</details>

<details>
<summary>What stays on screen, and how do I stop it?</summary>

An already-visible box retains its last caption when paused. Return to the source YouTube page to hide it, use × to dismiss it, or quit from the helper's menu-bar icon to stop the local service. To restore browser-only PiP after quitting, refresh YouTube.

</details>

The source setup is macOS-only. Start the helper when you want desktop captions; it does not currently install a login item or auto-start service.

## Checks

```sh
npm test
npm run check
swiftc scripts/desktop-captions/CaptionWindowState.swift tests/desktop-caption-visibility.swift -o /tmp/atlas-caption-visibility
/tmp/atlas-caption-visibility
```
