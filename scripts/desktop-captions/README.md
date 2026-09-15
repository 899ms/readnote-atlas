# Readnote Atlas desktop captions

The Chrome side is included in **Readnote Atlas**. Do not install a second
caption/bridge extension. The optional local macOS helper draws one independent
always-on-top window so captions remain available when Chrome is minimized.

## Local setup

Requirements: macOS, Node.js, and Apple's Command Line Tools (`swiftc`).

1. Load/reload the Readnote Atlas extension and note its ID in `chrome://extensions`.
2. From the project root, pair that ID once:

   ```sh
   npm run desktop:captions -- --extension-id=YOUR_READNOTE_ATLAS_ID
   ```

3. Refresh existing YouTube tabs. Later starts use `npm run desktop:captions`;
   the paired extension ID is remembered locally. Keep this helper running.
4. If migrating from the prototype, stop the old helper and disable its bridge
   extension before testing. The old extension can then be removed.

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
  both languages with half-line spacing. No title bar or second browser PiP frame.
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

## Checks

```sh
npm test
npm run check
swiftc scripts/desktop-captions/CaptionWindowState.swift tests/desktop-caption-visibility.swift -o /tmp/atlas-caption-visibility
/tmp/atlas-caption-visibility
```
