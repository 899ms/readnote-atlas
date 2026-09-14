# Background captions prototype

Throwaway UI prototype for the cross-tab subtitle question. It does not load or mutate Readnote Atlas data.
Production application code is intentionally untouched; this folder is only for exploration and review.

Run one local server command from the repository root:

```bash
python3 -m http.server 4175 --directory docs/prototypes
```

Then open <http://127.0.0.1:4175/background-captions.html?variant=A>.

- `?variant=A` — fixed bottom-right box (resizable)
- `?variant=B` — centered subtitles (resizable)

Click **Open floating captions** from the page to try Chrome's Document Picture-in-Picture window. The demo advances through three interview cues in memory only.
Both layouts expose a native bottom-right resize handle. Drag the corner to change the frame; a `ResizeObserver` recalculates the bilingual type scale and line wrapping as the frame changes.
The caption surface itself intentionally contains only one English line and one Chinese line; timing and mode labels stay outside the subtitle box.

To test the cross-tab idea, open the floating window, then switch to another tab or app. Use **Hide** or close the floating window when you are done.
