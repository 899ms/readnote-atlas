# Automatic background captions

## Implementation

The previous 250 ms timer only rendered an existing PiP window. It could not
create one without a click, and hiding its HTML did not close its native frame.
The new default registers the Media Session `enterpictureinpicture` handler on
video setup and re-registers when playback starts. Chrome invokes the handler
with the activation needed for `documentPictureInPicture.requestWindow()`.
No asynchronous extension message precedes that call, which would risk losing
the browser-granted activation. Do not add a `leavepictureinpicture` media action:
that is not part of the documented automatic PiP flow. Chrome closes automatic
windows on return; the extension also closes its own window on foreground focus.

Only the PiP action is changed. YouTube's play, pause, seek and metadata handlers
are untouched. Auto is a local preference, defaults to true, and can be disabled.
An unsupported media action falls back to a manual Open control. Browser permission
denial is respected; visibility events do not repeatedly attempt to open a window.

## Browser constraints

Official documentation verified September 15, 2026:

https://developer.chrome.com/blog/automatic-picture-in-picture-media-playback

Chrome documents support starting in desktop Chrome 134, subject to rollout,
Safe Browsing, top-frame media, audio focus, ongoing playback, audio audible
within two seconds, site engagement or explicit automatic-PiP permission, and
no conflicting existing PiP. The browser may show an initial permission prompt.
Registration is not proof that those conditions are satisfied.

The docs explicitly cover switching tabs. Minimize, switching apps, Spaces,
and multiple displays must be checked on the user's platform. Do not advertise
these as verified merely because a blur event is observed. Chrome's source label
and native PiP frame remain; CSS cannot turn this into a native desktop glass panel.

## Verification

`node --test tests/background-captions.test.js` exercises production lifecycle
functions with a simulated browser Media Session callback. It reproduces the old
missing-handler failure and verifies reopening, foreground close, Off preference,
paused/muted/ended guards and the unsupported-browser fallback. It does not prove
that the real browser grants permission or dispatches the callback.

Real Chrome acceptance: reload the unpacked extension and the YouTube page; do
not press Open/Enable. Play an unmuted video, leave for another tab, inspect any
browser permission prompt, then return. Repeat the cycle twice and verify that
the whole window closes, bilingual captions continue, and the main video is
unaffected. Separately test minimize and app switching and record their outcomes.
