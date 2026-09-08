# Readnote Studio

[简体中文](README.zh-CN.md)

Read English without leaving the original context. Readnote Studio is a local-first Chrome extension that turns articles and YouTube videos into bilingual reading surfaces, then sends the ideas you keep to your own Obsidian or Notion knowledge base.

## The product idea

Translation is a reading aid, not the destination. The original page or video remains the primary surface. Readnote Studio helps you understand, select, annotate, and keep only what matters:

1. Stay with the source.
2. Add Chinese only where it improves comprehension.
3. Capture an exact passage with its context and source link.
4. Store the result in a knowledge base you control.

The project combines the local-first knowledge workflow of [Readnote](https://github.com/pheobepotato/readnote) with the transcript, bilingual translation, overview, and timestamp navigation foundations of [YouTube Digest](https://github.com/zarazhangrui/youtube-digest/releases/tag/v1.2.0).

## What works

### Articles

- Translate readable English paragraphs progressively in place.
- Highlight, underline, add a note, or save selected text without leaving the page.
- Restore annotations when the same URL is reopened.
- Append saved excerpts to an Obsidian Markdown notebook and optionally to Notion.

### YouTube videos

- Show an English and Simplified Chinese subtitle layer directly over the player.
- Keep bilingual English + Chinese on with one `On` / `Off` switch.
- Expand a small `Aa` control to adjust the subtitle font, size, and vertical position; it collapses again after each choice.
- Read the complete timestamped transcript in Chrome's side panel.
- Search the transcript and jump between matches without moving playback.
- Click a transcript row or note to seek to that moment.
- Select transcript passages to explain or save as timestamped notes.
- Generate one comprehensive Chinese overview of the full discussion on demand.
- Save every video note locally first, then sync it to Obsidian and/or Notion.

## Install for development

Requirements: Chrome 116+, Node.js 20+, a Supadata key for YouTube transcripts, and a DeepSeek key for video translation and AI features.

```bash
npm install
npm run build
npm test
npm run check
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this project folder. Open the extension Settings page and enter the Supadata and DeepSeek keys yourself. Never paste keys into source code, GitHub, screenshots, or chat.

## Personal knowledge base

Start the local companion:

```bash
npm run companion
```

Open `http://127.0.0.1:8791/setup` and configure:

- the absolute path of one Obsidian Markdown notebook;
- an optional Notion integration token and destination page id; and
- an article-translation provider and key.

The companion writes secrets to `.env.local`, which is ignored by Git. Article excerpts and timestamped video notes share one source-aware format, so the notebook becomes a continuous reading history instead of an export folder.

## Data flow

- Article annotations, translations, video transcripts, notes, and caches live in Chrome local storage.
- Article translation and knowledge sync go to the local companion at `127.0.0.1:8791`.
- The companion writes only to the configured Markdown file and Notion page.
- Supadata receives a canonical YouTube URL when a transcript is requested.
- DeepSeek receives only the transcript content needed for the requested video feature.
- There is no Readnote Studio account, analytics SDK, advertising, or developer-operated cloud server.

See [PRIVACY.md](PRIVACY.md) for the full description.

## Commands

```bash
npm run build       # compile the article reader content script
npm test            # run unit and product-contract tests
npm run typecheck   # check the TypeScript article reader
npm run check       # build, typecheck, test, and audit the release set
npm run package     # create dist/readnote-studio-v0.1.0.zip
npm run companion   # start the local knowledge companion
```

## Current boundaries

- YouTube Shorts, live streams, private videos, and videos without native captions are not supported.
- The player subtitle layer fetches and caches native captions automatically; opening the side panel is optional.
- YouTube features currently use Supadata and DeepSeek; article translation can use DeepSeek, OpenAI, or MiniMax through the companion.
- Chrome is the supported browser for this first release.

## License and attribution

MIT. Significant video workflow code derives from YouTube Digest by Zara Zhang and retains its copyright notice in [LICENSE](LICENSE).
