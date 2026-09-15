# Background captions prototype

Throwaway UI prototype for the cross-tab subtitle question. It does not load or mutate Readnote Atlas data.
Production application code is intentionally untouched; this folder is only for exploration and review.

Run one local server command from the repository root:

```bash
python3 -m http.server 4175 --directory docs/prototypes
```

Then open <http://127.0.0.1:4175/background-captions.html?variant=A>.

The prototype now represents the production direction: one translucent, resizable caption box with one English line and one Chinese line. The font scales from the available box size and the box grows when a long cue needs more room.

Click **Open floating captions** from the page to try Chrome's Document Picture-in-Picture window. The demo advances through three interview cues in memory only.
The caption surface contains no layout picker, browser-style sidebar, or manual font-size control; timing and mode labels stay outside the subtitle box.

To test the cross-tab idea, open the floating window, then switch to another tab or app. Use **Hide** or close the floating window when you are done.
