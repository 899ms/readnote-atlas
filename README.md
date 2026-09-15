# Readnote Atlas

[简体中文](README.zh-CN.md)

**Understand the English-speaking world—from text to video.**

Readnote Atlas is a local-first Chrome extension for reading English articles, studying YouTube, and keeping the ideas that matter. English stays visible; Chinese helps you move through it; every saved passage keeps its source.

Keep notes locally, then send selected ideas to your own Obsidian or Notion knowledge base.

> Translation is a reading aid, not the destination.

[Install](#install-once) · [Try it](#try-your-first-reading-session) · [Desktop captions](#optional-captions-over-other-apps-macos) · [FAQ](#questions-before-you-start) · [Design & origins](#why-i-built-atlas)

## Start here

| If you want to… | Use |
| --- | --- |
| Read an article | Highlight or annotate on the original page. Run the local companion for in-place Chinese translation. |
| Watch a video | Open a captioned YouTube video. Readnote Atlas shows English + Simplified Chinese directly over the player and keeps a full transcript in the side panel. |
| Keep a thought | Bookmark a timestamp, select a transcript paragraph, or write a personal thought. |
| Listen while working | Run the optional macOS caption helper. When YouTube keeps playing outside the active Chrome page, one compact always-on-top caption box follows along. |

## What the product feels like

`Source → bilingual understanding → precise selection → personal note → Obsidian / Notion`

The source remains primary. A paragraph and a video timestamp are treated as the same kind of knowledge anchor, so reading and watching lead to one continuous personal library.

### Articles

- Translate readable English paragraphs progressively, without leaving the page.
- Highlight, underline, annotate, and save selected text.
- Restore annotations when the same URL is reopened.
- Send source-linked excerpts to an Obsidian Markdown notebook and optionally Notion.

### YouTube

- Show a centered English and Simplified Chinese subtitle layer directly over the player.
- Keep one predictable `On` / `Off` bilingual switch—never English-only or Chinese-only modes.
- Translate the active cue while pre-translating ahead of playback; after a seek, prioritize the new playback position. First-load and uncached translations still depend on your provider's speed.
- Drag and resize the subtitle area; text reflows naturally and fits the available box.
- Generate a comprehensive Chinese Overview as soon as captions load.
- Use the side panel in this order: **Overview → Notes → Transcript → Library**.
- Read and search the complete transcript as selectable bilingual paragraphs, then jump to their timestamps.
- Capture a timestamp with the small bookmark, save a selected passage, or add a free-form thought.
- Add videos to Watched Library after ten minutes of actual foreground playback.

## Install once

This is a source-based installation, not a Chrome Web Store installer. Start with Chrome 116+ and Node.js 22.19+.

| Capability | What to configure |
| --- | --- |
| Article highlights and local annotations | Extension only |
| YouTube bilingual captions, overview, and transcript | Supadata API key + a supported video AI provider key in Settings |
| Article translation | Local knowledge companion + article provider key |
| Obsidian / Notion sync | Local knowledge companion + your chosen destination |
| Always-on-top captions across apps | Readnote Atlas + optional macOS helper |

```bash
git clone https://github.com/pheobepotato/readnote-atlas.git
cd readnote-atlas
npm install
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the repository folder containing `manifest.json`.
3. Open the extension's **Options** / **Readnote Atlas Settings**. For YouTube, enter your Supadata key and configure an AI profile: DeepSeek, OpenAI, Google Gemini, OpenRouter, or a custom OpenAI-compatible endpoint.
4. Save changes, then refresh any already-open YouTube or article tabs.

Bring your own keys. Provider usage may incur charges; set spending limits in your provider accounts.

## Try your first reading session

- [ ] Open a captioned English YouTube interview and start playback. Keep bilingual subtitles **On**. English and Chinese appear together once the transcript and translations are ready.
- [ ] Click **Readnote Atlas** below the player, or its Chrome toolbar icon. **Overview** is the default view; its Chinese summary starts generating when captions load, even before you open the panel.
- [ ] Hear something worth keeping? Click the small player bookmark. Open **Notes** to see the timestamped moment or write a personal thought with **Save note**.
- [ ] Open **Transcript**, search or select a meaningful passage, and save it. It joins the same Notes collection; a timestamp takes you back to its context.
- [ ] Come back later through **Library**. A video qualifies after ten cumulative minutes of foreground playback—seeking and background listening do not count toward that threshold.

For articles, select a passage to highlight, underline, annotate, or save. Start the companion below if you also want paragraph translation or knowledge-base sync.

### Optional: article translation and knowledge sync

```bash
npm run companion
```

Open `http://127.0.0.1:8791/setup`. Set an article translation provider (DeepSeek, OpenAI, or MiniMax) and key, a single Obsidian Markdown notebook path, and optionally a Notion integration token and destination page ID for the features you want.

Keep the companion running while translating articles or syncing. It stores configuration in the ignored `.env.local` file. Video notes save locally before sync; you do not need Obsidian or Notion to start collecting them.

### Optional: captions over other apps (macOS)

For cross-app captions, run the optional native macOS helper alongside Readnote Atlas:

Requirements: macOS and Apple's Command Line Tools (`swiftc`), in addition to Node.js. Copy **your** Readnote Atlas extension ID from `chrome://extensions` and replace the placeholder:

```bash
npm run desktop:captions -- --extension-id=YOUR_READNOTE_ATLAS_ID
```

Refresh your YouTube tab after pairing. Keep the helper running; later starts use `npm run desktop:captions` without the ID. This source setup does not install an auto-start service.

- [ ] Start a video, then switch tabs or minimize Chrome. A compact, borderless caption box stays above your other apps.
- [ ] Drag or resize it. English and Chinese auto-fit in a left-aligned graphite-glass box with a small gap between languages.
- [ ] Hover to reveal **rewind 15s · play/pause · forward 15s**, plus a bookmark and close control.
- [ ] Pause: the last caption stays. Return to YouTube: the box hides. Close with **×**: it stays dismissed until you return to YouTube.

See [the helper guide](scripts/desktop-captions/README.md) for pairing and troubleshooting. After quitting the helper, refresh YouTube to restore browser-only PiP fallback; that fallback depends on Chrome permissions and does not promise the same cross-app behavior.

Never put API keys, `.env.local`, pairing files, or machine-specific binaries in GitHub.

## Commands

```bash
npm run build       # build the article reader
npm test            # run product and unit tests
npm run typecheck   # check TypeScript
npm run check       # build, typecheck, test, and audit the release set
npm run package     # create dist/readnote-atlas-v0.3.0.zip
npm run companion   # start the local knowledge companion
npm run desktop:captions  # start the optional macOS caption helper
```

## Questions before you start

<details>
<summary>Common questions</summary>

**Why is a video not translated?** It needs native YouTube captions, a Supadata key, and a configured video AI provider. Shorts, live streams, private videos, and videos without native captions are outside this release.

**Where is my data?** Notes, transcripts, caches, settings, and watched progress stay in Chrome local storage. YouTube caption fetching, pretranslation, and overview generation can begin automatically when a video loads. Supadata receives its URL; the chosen AI provider receives relevant transcript text/context. Local-first does not mean all AI runs offline.

**Why does translation sometimes wait?** Atlas pre-translates ahead, caches results, and prioritizes the active cue after a seek. A new video, uncached position, provider rate limit, or network delay can still mean a wait. Check saved keys/provider settings; zero-latency translation is not guaranteed.

**Does the helper start automatically?** No. This source setup does not install or launch it from Chrome. Start the helper when you want cross-app captions. If no box appears, check pairing, refresh YouTube, and keep only one helper listening on port 8792.

**How do I update?** In a clean clone, run `git pull --ff-only`, `npm install`, and `npm run build`. Reload Readnote Atlas at `chrome://extensions`, refresh open pages, and restart the native helper if its code changed. Preserve your own local changes before updating.

</details>

## Why I built Atlas

The original Readnote began with a simple idea: understanding a passage is more valuable when you can keep your own thought beside it. Interviews and lectures deserve that same path—not a separate pile of summaries.

Atlas brings text and video into that workflow. English stays available for nuance; Chinese makes the ideas accessible; a note keeps the source close enough to revisit. The goal is a continuous learning history, not a translation archive.

Its design stays quiet: source-first reading, bilingual context, precise capture, and user-owned memory. See [PRODUCT.md](PRODUCT.md) for the interaction model and acceptance criteria, and [PRIVACY.md](PRIVACY.md) for data flows.

## Origins and attribution

Readnote Atlas is an independent project built from two foundations:

- [Readnote](https://github.com/pheobepotato/readnote), created by the same author, established the source-first reading philosophy, local annotation model, and Obsidian/Notion workflow.
- [YouTube Digest v1.2.0](https://github.com/zarazhangrui/youtube-digest/releases/tag/v1.2.0), created by **Zara Zhang**, provided the open-source foundation and inspiration for transcript retrieval, bilingual video study, timestamp navigation, explanations, and video notes. Portions of Atlas's video workflow code are derived from and substantially redesigned from that project under the MIT License.

Readnote Atlas is not an official YouTube Digest release and is not endorsed by Zara Zhang. Original notices remain in [LICENSE](LICENSE); project history is documented in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).

## Privacy and license

Read the complete data-flow description in [PRIVACY.md](PRIVACY.md). Readnote Atlas is released under the [MIT License](LICENSE).
