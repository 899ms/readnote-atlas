const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');

function harness({ preference = true, supported = true } = {}) {
  const actions = new Map();
  const events = new Map();
  const windows = [];
  let requests = 0;
  const video = {
    paused: false, ended: false, muted: false, volume: 1, currentTime: 20,
    addEventListener(name, handler) { events.set(`video:${name}`, handler); },
    removeEventListener(name) { events.delete(`video:${name}`); },
  };
  const document = {
    visibilityState: 'visible', focused: true,
    hasFocus() { return this.focused; },
    addEventListener(name, handler) { events.set(`document:${name}`, handler); },
    removeEventListener(name) { events.delete(`document:${name}`); },
  };
  const context = vm.createContext({
    document, video, console, setTimeout, clearTimeout,
    setInterval() { return 1; }, clearInterval() {},
    chrome: { storage: { local: {
      async get(key) { return { [key]: preference }; },
      async set() {},
    } } },
    navigator: { mediaSession: { setActionHandler(name, handler) {
      if (!supported) throw new Error('Unsupported action');
      if (handler) actions.set(name, handler); else actions.delete(name);
    } } },
    window: {
      addEventListener(name, handler) { events.set(`window:${name}`, handler); },
      removeEventListener(name) { events.delete(`window:${name}`); },
      documentPictureInPicture: { async requestWindow() {
        requests++;
        const listeners = new Map();
        const w = {
          closed: false, focused: false,
          focus() { this.focused = true; },
          addEventListener(name, handler) { listeners.set(name, handler); },
          close() { this.closed = true; listeners.get('pagehide')?.(); },
        };
        windows.push(w);
        return w;
      } },
    },
  });
  // Run the production globals and background-caption lifecycle, not a copy.
  vm.runInContext(source.slice(source.indexOf('let ytdNoteButton'), source.indexOf('// INITIALIZATION')), context);
  vm.runInContext(source.slice(source.indexOf('async function setupReadnoteBackgroundCaptionSync'), source.indexOf('function setupReadnoteSubtitleTransform')), context);
  // DOM layout is outside these lifecycle tests; preserve the real open/sync paths.
  vm.runInContext('injectReadnoteBackgroundCaptionWindow = () => {}; renderReadnoteBackgroundCaptionWindow = () => {};', context);
  return {
    context, document, video, windows, actions, events,
    requests: () => requests,
    async setup() {
      await vm.runInContext('setupReadnoteBackgroundCaptionSync(video)', context);
      await Promise.resolve();
    },
    async leave() {
      document.visibilityState = 'hidden'; document.focused = false;
      events.get('document:visibilitychange')?.();
      await actions.get('enterpictureinpicture')?.();
    },
    returnToVideo() {
      document.visibilityState = 'visible'; document.focused = true;
      events.get('document:visibilitychange')?.();
      events.get('window:focus')?.();
    },
  };
}

test('playing video registers automatic PiP without clicking Enable and opens on browser action', async () => {
  const h = harness();
  await h.setup();
  assert.equal(typeof h.actions.get('enterpictureinpicture'), 'function');
  assert.equal(h.requests(), 0, 'must not open over the foreground video');
  await h.leave();
  assert.equal(h.requests(), 1);
  assert.equal(h.windows[0].focused, false, 'automatic captions must not steal focus');
});

test('returning to YouTube closes the window; a second departure opens again without Enable', async () => {
  const h = harness();
  await h.setup();
  await h.leave();
  assert.equal(h.windows.length, 1);
  h.returnToVideo();
  assert.equal(h.windows[0].closed, true, 'hiding the HTML is not closing the PiP frame');
  await h.leave();
  assert.equal(h.requests(), 2);
});

test('paused, ended, muted, or captions-Off video never auto-opens', async () => {
  for (const state of ['paused', 'ended', 'muted', 'captionsOff']) {
    const h = harness();
    await h.setup();
    assert.ok(h.actions.has('enterpictureinpicture'));
    if (state === 'captionsOff') vm.runInContext('readnoteSubtitleMode = "off"', h.context);
    else h.video[state] = true;
    await h.leave();
    assert.equal(h.requests(), 0, state);
  }
});

test('saved Off preference disables automatic PiP', async () => {
  const h = harness({ preference: false });
  await h.setup();
  await h.leave();
  assert.equal(h.requests(), 0);
  assert.equal(h.actions.size, 0);
});

test('unsupported media action preserves the manual fallback without throwing', async () => {
  const h = harness({ supported: false });
  await h.setup();
  await h.leave();
  assert.equal(h.requests(), 0);
  await vm.runInContext('openReadnoteBackgroundCaptions()', h.context);
  assert.equal(h.requests(), 1);
});
