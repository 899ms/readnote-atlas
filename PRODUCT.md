# Readnote Atlas Product Brief

## Product promise

**Understand English in context. Keep only what becomes yours.**

Readnote Atlas is not a translation archive and not a generic summarizer. It is a reading layer for source material and a capture path into a user-owned knowledge base.

## Primary loop

`Source → bilingual understanding → precise selection → personal note → Obsidian / Notion`

The loop is identical for text and video. A video timestamp plays the same role as a paragraph anchor on an article page.

## Experience principles

1. **The source remains primary.** Translation appears beside or over the source, never as a disconnected replacement.
2. **Progressive cost.** Enabling bilingual playback is an ongoing request to translate the active subtitle plus a limited window ahead of the playhead; overviews and content outside that window are generated only when the user requests or reaches them.
3. **Precise capture before synthesis.** Notes preserve the exact excerpt, source URL, title, and timestamp before AI cleanup or commentary.
4. **User-owned memory.** Local storage is the safety net; Obsidian and Notion are destinations chosen by the user.
5. **Quiet interface.** The Readnote visual language uses dark ink, paper-white surfaces, restrained blue actions, and pale-yellow selection; shadows, rounding, and decoration recede while reading or watching.

## Information architecture

- **Original surface**
  - Article: inline translation and selection toolbar.
  - Video: bilingual player subtitles and a low-friction Note action.
- **Side panel**
  - Transcript: complete, searchable, bilingual, playback-aware.
  - Overview: one comprehensive Chinese account of the full discussion.
  - Notes: current-video or all-video notebook with knowledge sync state.
- **Settings**
  - Video providers: Supadata and DeepSeek.
  - Personal knowledge base: local companion, Obsidian path, optional Notion page.
  - Local data controls and privacy explanation.

## v0.1 success criteria

- A user can watch a captioned English YouTube video with in-player Chinese support.
- Bilingual translation has one predictable On / Off state, and player subtitle typography and position are adjustable without permanently covering the video.
- A user can inspect and search the complete transcript without losing playback position.
- A user can select a transcript passage and save a timestamped note.
- The saved note remains available locally if every external service is offline.
- When configured, the same note is appended to Obsidian and Notion with a playable timestamp link.
- Article highlights continue to use the same knowledge destination.
