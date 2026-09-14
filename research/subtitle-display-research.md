# Subtitle display research: timing, reading comfort, and cross-tab captions

**Research date:** 2026-09-14  
**Scope:** YouTube/interview playback in Readnote Atlas. Evidence review and UX proposal only; no application code changes.

## Executive summary

1. Professional subtitle standards aim for speech-synchronous timing: a cue enters with the corresponding speech and leaves when it ends, subject to duration, shot-change and reading-speed limits. They do not prescribe a universal “one sentence early” offset.
2. Human audiovisual speech perception tolerates a small temporal mismatch, and natural mouth movements can precede sound by tens of milliseconds. This does not show that written subtitles should systematically lead speech.
3. For AI translation, the key latency strategy is prefetching and bounded buffering, not a display offset: keep the English cue aligned to the source timestamp, translate the next several cues immediately, and show a short honest pending state only when the buffer is exhausted.
4. Chrome Side Panel is tab-scoped. Standard video PiP floats a video element but cannot host arbitrary HTML subtitle cards. Chrome Document Picture-in-Picture (Chrome 116+) can host arbitrary HTML in an always-on-top window and is the strongest fit for an optional background-caption companion.

## 1. Subtitle timing standards

### Evidence

Netflix Timed Text Style Guides require timing that follows dialogue and impose reading-speed and duration constraints. The English guide gives a maximum reading-speed target of 17 characters per second (CPS). A cue may be retimed for minimum duration, readability, or shot changes, but the guide does not recommend a fixed lead before every utterance.

- Netflix, English (USA) Timed Text Style Guide, Timing and Reading Speed: <https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide> (accessed 2026-09-14).
- Netflix, Timed Text Style Guides index: <https://partnerhelp.netflixstudios.com/hc/en-us/sections/115001001812-Timed-Text-Style-Guides> (accessed 2026-09-14).

BBC subtitle guidance likewise says subtitles should appear with the speech they represent and remain long enough to read. It discusses line breaks, speaker changes, shot changes, and reading speed. A small retiming for a cut or minimum duration is an editing/legibility accommodation, not a general “early subtitle” rule.

- BBC, Subtitle guidelines: <https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/> (accessed 2026-09-14).

EBU timed-text recommendations treat synchronisation, readability, and shot-change safety as separate quality dimensions. Live captions can have a larger end-to-end delay because recognition and correction take time; that is pipeline latency, not a perceptual preference for early text.

- European Broadcasting Union, EBU technical publications: <https://tech.ebu.ch/publications/tech_guides> (accessed 2026-09-14).
- EBU, EBU-TT Part 1: <https://tech.ebu.ch/publications/tech3370> (accessed 2026-09-14).

DCMP’s Captioning Key states captions should be synchronized as closely as possible with audio and displayed long enough to be read. W3C defines captions as a time-synchronized text alternative for speech and meaningful audio.

- DCMP, Captioning Key, Synchronization and Presentation Rate: <https://dcmp.org/caai/nadh/12-Captioning-Key> (accessed 2026-09-14).
- W3C WAI, Captions/Subtitles: <https://www.w3.org/WAI/media/av/captions/> (accessed 2026-09-14).

### Product implication

- Treat each YouTube cue timestamp as source truth; target nominal offset 0 ms.
- Do not hard-code a “microsecond” lead. If rendering/network jitter is measurable, test a small configurable compensation (for example 80–120 ms), rather than masking translation latency with a multi-second lead.
- Keep long interview cues readable: segment at clause/punctuation boundaries and wrap to available width. Do not move an overflowing cue earlier.
- Separate media sync from translation readiness: English can be on time while Chinese is pending for a bounded period.

## 2. Cognitive timing evidence

Audiovisual speech is integrated over a temporal binding window rather than at one exact instant. Experiments with temporally offset mouth movements and speech show that listeners can fuse signals when one modality leads or lags by a small amount; the width varies across people and tasks.

- Stevenson, Zemtsov & Wallace (2012), Individual differences in the multisensory temporal binding window predict susceptibility to the McGurk effect, JEP:HPP. DOI: <https://doi.org/10.1037/a0027339> (accessed 2026-09-14).
- Stevenson et al. (2012), The temporal window of audiovisual speech integration, Journal of Cognitive Neuroscience. PubMed search: <https://pubmed.ncbi.nlm.nih.gov/?term=The+temporal+window+of+audiovisual+speech+integration+Stevenson> (accessed 2026-09-14).

Natural mouth movements can begin before their acoustic signal (often tens of milliseconds, depending on the measure). This helps explain why a small software error may be hard to notice; it does not establish that written subtitles should lead speech. Text is a symbolic, predictive signal and can alter comprehension and conversational turn-taking.

- Grant, van Wyk & Bakhshaee (2012), The effects of temporal asynchrony on audiovisual speech perception, JASA. Acoustical Society search: <https://pubs.aip.org/asa/jasa/search-results?f_ArticleType=research-article&fl_SiteID=1000001&sd=2012&q=temporal+asynchrony+audiovisual+speech+perception> (accessed 2026-09-14).
- d’Ydewalle & De Bruycker (2007), Eye movements of children and adults while reading television subtitles, European Psychologist. DOI: <https://doi.org/10.1027/1016-9040.12.3.196> (accessed 2026-09-14).
- Perego et al. (2010), The cognitive effectiveness of subtitle processing, Media Psychology. DOI: <https://doi.org/10.1080/15213269.2010.502873> (accessed 2026-09-14).

### Testable hypothesis

Run a within-subject A/B/C test on the same interview clips:

| Condition | Cue timing | Purpose |
| --- | --- | --- |
| A | 0 ms | Standards-compliant baseline |
| B | -80 ms (lead) | Small latency compensation |
| C | +120 ms (lag) | Test whether slight lag is less distracting than anticipation |

Measure comprehension, missed words, perceived sync, and annoyance for English listeners and Chinese learners, with short and long translated cues. Choose an offset per rendering path only if it improves perceived sync and comprehension.

## 3. Cross-tab caption feasibility in Chrome

Side Panel. The chrome.sidePanel API is an extension panel associated with a tab/window. It is useful for Transcript, Overview, and Notes while YouTube is active, but is not an always-on-top surface over another tab or desktop application.

- Chrome Extensions, chrome.sidePanel API: <https://developer.chrome.com/docs/extensions/reference/api/sidePanel> (accessed 2026-09-14).

Standard video PiP. HTMLVideoElement.requestPictureInPicture creates a browser-managed floating window above other windows. It is designed around a video element; arbitrary HTML transcript/subtitle cards cannot reliably be placed inside YouTube’s standard PiP window.

- Chrome for Developers, Picture-in-Picture for video: <https://developer.chrome.com/docs/web-platform/picture-in-picture> (accessed 2026-09-14).
- MDN, requestPictureInPicture: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture> (accessed 2026-09-14).

Document Picture-in-Picture. Chrome’s Document PiP opens an always-on-top window whose contents are arbitrary HTML. Chrome documents support from version 116 onward and requires a user activation; feature-detect it. It can host a compact bilingual cue, title, Pause/Hide/Close controls, and remembered size/position.

- Chrome for Developers, Document Picture-in-Picture API: <https://developer.chrome.com/docs/web-platform/document-picture-in-picture> (accessed 2026-09-14).

Offscreen documents and capture. chrome.offscreen is a hidden DOM context, not a visible overlay. chrome.tabCapture is a capture primitive after a user gesture, not a caption window. Service workers can be suspended and timers throttled, so timing should be reconciled to video.currentTime on focus/visibility changes.

- Chrome Extensions, chrome.offscreen API: <https://developer.chrome.com/docs/extensions/reference/api/offscreen> (accessed 2026-09-14).
- Chrome Extensions, chrome.tabCapture API: <https://developer.chrome.com/docs/extensions/reference/api/tabCapture> (accessed 2026-09-14).
- Chrome Extensions, Extension service worker lifecycle: <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle> (accessed 2026-09-14).
- Chrome Developers, Page Lifecycle API: <https://developer.chrome.com/docs/web-platform/page-lifecycle-api> (accessed 2026-09-14).

YouTube. The official IFrame Player API exposes playback controls/events for embedded players, not a general transcript/live-caption API for arbitrary watch pages. Reading rendered caption DOM or internal player state is therefore an implementation-sensitive adapter that can break when YouTube changes its UI.

- YouTube, IFrame Player API: <https://developers.google.com/youtube/iframe_api_reference> (accessed 2026-09-14).

## 4. UX options

### A. In-video captions (default)

Keep bilingual captions centered in the player’s lower safe area with adaptive width and clause-aware wrapping. This preserves familiar context and cue-to-picture alignment. It is not visible after tab switching.

### B. Document PiP “Background captions” (opt-in)

Expose Open floating captions. Open a small Document PiP window with only the current bilingual cue, a source title, and Pause/Hide/Close. Let the OS move/resize it and remember non-sensitive geometry. Closing the window must not pause YouTube unless explicitly chosen. If unavailable, explain the Chrome requirement and keep in-video captions.

### C. Standard video PiP + external transcript

Use browser PiP for the video and keep the full transcript in Atlas’ side panel/separate page. Mature and familiar, but split across windows; the HTML subtitle card cannot live inside standard YouTube PiP.

### D. Background listening mode

Continue audio and save transcript/translation for later, with an optional shortcut to reveal the latest cue. Least distracting, but not continuous visual support.

## 5. Recommended behavior

1. Default to in-video bilingual captions, source timestamps, and nominal 0 ms offset.
2. Prefetch a rolling window (e.g. next 5–10 cues or 20–30 seconds), cache by video ID + cue ID, and prioritize current/next cues. On seek, cancel stale work and prefetch from the new position.
3. Wrap at clause/punctuation boundaries; cap lines by width/characters; keep the card centered in the player safe area.
4. Add opt-in Document PiP with Pause, Hide, and Close. Feature-detect Chrome 116+ and provide a fallback explanation.
5. On tab visibility/focus changes, reconcile video.currentTime and cue ID before painting; do not rely on a background setInterval.
6. Test 0 ms, -80 ms, and +120 ms before enforcing any rendering compensation.

## Confidence and evidence boundary

- High confidence: Netflix/BBC/DCMP/W3C/EBU timing principles and Chrome API capabilities (first-party documentation linked above).
- Moderate confidence: audiovisual integration-window width varies by task/person; cited peer-reviewed work supports tolerance to small asynchronies, not a universal subtitle offset.
- Product inference: Document PiP is the most direct Chrome-native route to an optional always-on-top HTML subtitle companion; it must remain optional and feature-detected.
