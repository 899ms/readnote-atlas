# Readnote Atlas

[简体中文](README.zh-CN.md)

**Understand the English-speaking world—from text to video.**

Readnote Atlas is a local-first Chrome extension for Chinese-native readers. It keeps English articles and videos in their original context, adds bilingual understanding where it helps, and turns the passages you choose into your own Obsidian or Notion knowledge base.

## Why this project exists

The most valuable ideas on the English-language internet arrive in many forms: essays, documentation, interviews, lectures, and long-form conversations. The problem is not simply translating them. A full-page translation can remove the original language, a summary can flatten the author's reasoning, and a separate note-taking tool can break the connection between an idea and its source.

Translation is a reading aid, not the destination. Readnote Atlas is designed around a different path:

`Source → bilingual understanding → precise selection → personal note → Obsidian / Notion`

The source always remains primary. English and Chinese stay together. An article paragraph and a video timestamp are treated as the same kind of knowledge anchor. Translation helps you cross the language boundary; notes help what you learn become yours.

This leads to five product principles:

1. **Read in context.** Stay on the original page or inside the original video.
2. **Bilingual by default.** Preserve English while adding concise Chinese support—never force a Chinese-only replacement.
3. **One experience across media.** Text and video share the same reading, selection, annotation, and knowledge-capture loop.
4. **Speed is part of comprehension.** Live subtitles must keep pace with playback, including after seeking into the middle of a long video.
5. **Your knowledge remains yours.** Store data locally first and sync only to destinations and providers you configure.

See [PRODUCT.md](PRODUCT.md) for the product brief and [the real-time subtitle architecture note](docs/realtime-caption-architecture.md) for the reasoning behind the player experience.

## What it does

### Articles

- Progressively translate readable English paragraphs in place.
- Highlight, underline, annotate, or save selected text without leaving the page.
- Restore annotations when the same URL is reopened.
- Append excerpts to an Obsidian Markdown notebook and optionally sync them to Notion.

### YouTube videos

- Display a centered English and Simplified Chinese subtitle layer directly over the player.
- Use one predictable `On` / `Off` bilingual switch—there are no English-only or Chinese-only modes.
- Stream the active Chinese translation as it arrives and pre-translate ahead of playback.
- Recover quickly after a seek, even when playback starts in the middle of a long video.
- Move and smoothly resize the subtitle area; text reflows naturally as its width changes.
- Open a clearly labelled, collapsible subtitle control for On / Off and text size; drag the subtitle itself to move it or its corner to reflow the width.
- Land on an automatically generated comprehensive Chinese overview as soon as captions load.
- Read, search, select, and translate the complete transcript as semantic paragraphs rather than caption fragments.
- Click a transcript row or note to seek to the exact moment.
- Use the small player bookmark to capture a strong moment, save a selected transcript passage, or write a free-form thought at the current timestamp.
- Save notes locally first, then sync them to Obsidian and/or Notion.
- Automatically collect videos after ten minutes of real foreground playback in a local Watched Library.

## Install for development

Requirements: Chrome 116+, Node.js 22.19+, a Supadata API key for YouTube transcripts, and a DeepSeek API key for video translation and AI features.

```bash
git clone https://github.com/pheobepotato/readnote-atlas.git
cd readnote-atlas
npm install
npm run build
npm test
npm run check
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the repository folder.
4. Open **Readnote Atlas Settings** and enter your own Supadata and DeepSeek keys.

Never paste API keys into source code, GitHub, screenshots, or chat.

## Personal knowledge base

Start the optional local companion:

```bash
npm run companion
```

Open `http://127.0.0.1:8791/setup` and configure:

- the absolute path of one Obsidian Markdown notebook;
- an optional Notion integration token and destination page id; and
- an article-translation provider and API key.

The companion stores secrets in `.env.local`, which is ignored by Git. Article excerpts and timestamped video notes use one source-aware format, so the notebook becomes a continuous learning history rather than an export folder.

## Privacy and data flow

- Article annotations, translation caches, video transcripts, notes, overviews, and watched-video progress live in Chrome local storage.
- Article translation and knowledge sync go through the local companion at `127.0.0.1:8791`.
- The companion writes only to the Markdown file and Notion page you configure.
- Supadata receives a canonical YouTube URL when a transcript is requested.
- DeepSeek receives only the content needed for the requested translation or AI feature.
- There is no Readnote Atlas account, analytics SDK, advertising, or developer-operated cloud server.

See [PRIVACY.md](PRIVACY.md) for the complete description.

## Commands

```bash
npm run build       # compile the article reader content script
npm test            # run unit and product-contract tests
npm run typecheck   # check the TypeScript article reader
npm run check       # build, typecheck, test, and audit the release set
npm run package     # create dist/readnote-atlas-v0.2.1.zip
npm run companion   # start the local knowledge companion
```

## Current boundaries

- YouTube Shorts, live streams, private videos, and videos without native captions are not supported.
- The player subtitle layer fetches and caches native captions automatically; opening the side panel is optional.
- YouTube features currently use Supadata and DeepSeek. Article translation can use DeepSeek, OpenAI, or MiniMax through the companion.
- Chrome is the supported browser for this first release.

## Origins and attribution

Readnote Atlas is an original redesign built from two foundations:

- [Readnote](https://github.com/pheobepotato/readnote), created by the same project author, established the source-first reading philosophy, local annotation model, and Obsidian/Notion knowledge workflow.
- [YouTube Digest v1.2.0](https://github.com/zarazhangrui/youtube-digest/releases/tag/v1.2.0), created by **Zara Zhang**, provided the open-source foundation and inspiration for transcript retrieval, bilingual video study, timestamp navigation, explanations, and video notes. Portions of the video workflow code are derived from and substantially redesigned from that project under the MIT License.

Readnote Atlas is an independent project and is not an official release of, or endorsed by, YouTube Digest or Zara Zhang. We are grateful for the work that made this exploration possible. Zara Zhang's original copyright notice is retained in [LICENSE](LICENSE), and the relationship between the projects is documented in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).

## License

[MIT](LICENSE). Contributions are welcome.
