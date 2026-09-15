# Desktop captions prototype

PROTOTYPE — disposable native macOS surface for validating one question:
does an independent always-on-top caption window remain visible when Chrome is
minimized and another app is active?

Run from the project root:

```sh
npm run prototype:desktop-captions
```

Drag or resize the frosted box. Move the pointer over it to reveal rewind 15s,
play/pause, forward 15s, and bookmark controls. The native panel stays above
other apps and keeps the last caption visible while paused; it hides when the
YouTube page returns to the foreground.

Seek commands use a small FIFO so rapid clicks are applied in order.
