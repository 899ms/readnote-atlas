# Privacy

Effective: September 8, 2026

Readnote Atlas is a local-first, bring-your-own-key Chrome extension. It has no Readnote Atlas account, developer-operated cloud backend, analytics, advertising, or telemetry.

## Data handled locally

Chrome local storage may contain article URLs, extracted article text, annotations, translation caches, YouTube video ids and metadata, transcripts, overviews, timestamped notes, watched seconds and last playback positions, provider settings, and API keys. Video notes are limited to the latest 100. The watched library is limited to 200 videos. Video caches are limited to 20 entries and are expired after 30 days.

Watched time is calculated locally from wall-clock time while a YouTube video is playing in a visible tab. Seeking does not count as watched time. A video becomes visible in the Watched Library after ten cumulative minutes; partial progress is retained locally so viewing can continue across sessions.

The extension runs its article reading layer on HTTP and HTTPS pages so it can translate and annotate them. It does not send a page anywhere until the user asks to translate or save an excerpt. YouTube uses a separate content script scoped to `youtube.com`.

## Local companion

The optional companion listens only on `127.0.0.1:8791`. It can:

- send selected article paragraphs to the translation provider configured in `.env.local`;
- append saved article excerpts and video notes to the single Markdown file path configured by the user; and
- append those excerpts to the Notion page explicitly configured by the user.

The companion does not scan an Obsidian vault or discover Notion pages. Notion credentials, notebook paths, and companion translation credentials remain in `.env.local`, which is excluded from Git.
Browser requests are accepted only from the companion's own loopback pages or Chrome extension origins. Its extension-facing health response reports configuration booleans only, never notebook paths, page IDs, profile names, provider names, or model names.

## External services

### Desktop captions

The optional native macOS caption helper listens only on `127.0.0.1:8792`.
Readnote Atlas's built-in transport sends the current bilingual cue, playback
time/state, and source-tab visibility to it. No additional translation provider
is called and no captions are persisted by the helper. Only an explicitly paired
Atlas extension origin can obtain the local session needed for state/commands.
Pairing data is local under `dist/desktop-captions/`, excluded from releases.

The native helper is a separate local process, not a second Chrome extension.
Pausing retains the last caption on screen until the user dismisses it or
returns to YouTube. Quit the helper from its menu-bar icon to stop the service.

- **Supadata:** receives the canonical YouTube watch URL and the user's Supadata key to return a native timestamped transcript.
- **Selected video AI provider:** DeepSeek, OpenAI, Google Gemini, OpenRouter, or a user-configured OpenAI-compatible endpoint receives the transcript segments or video context needed for a requested translation, overview, explanation, or note-cleanup action.
- **Optional article translation provider:** DeepSeek, OpenAI, or MiniMax receives only the article paragraphs requested through the companion.
- **Optional Notion sync:** Notion receives only the excerpt, note context, and source link being saved to the configured page.

These providers process data under their own terms, privacy policies, retention rules, and account settings.

## Permissions

- `sidePanel`: show the video transcript workspace.
- `storage`: keep settings, annotations, notes, transcripts, watched-video progress, and caches locally.
- `tabs` and `scripting`: identify the active YouTube video and coordinate playback actions.
- HTTP/HTTPS content script access: add the article reading and annotation layer.
- Host access to YouTube, Supadata, the selected built-in AI provider, `127.0.0.1:8791` (knowledge companion), and `127.0.0.1:8792` (optional desktop captions): provide the documented product flows. A custom endpoint requests access only to its configured origin when the user saves that profile.

## Removing data

Use Settings to clear cached video data, delete notes, or reset extension storage. Removing the extension also removes its Chrome storage. Delete `.env.local` separately to remove companion settings. Deleting local data does not remove data already processed or retained by an external provider; use that provider's controls for service-side deletion.

Chrome local storage and `.env.local` are not encrypted password vaults. Use dedicated API keys, set spending limits, and revoke keys if the device or browser profile is compromised.
