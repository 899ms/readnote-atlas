const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness({ helperAbsent = false, focused = true, minimized = false } = {}) {
  let listener;
  const requests = [];
  const timers = [];
  const storageWrites = [];
  const source = { id: 7, windowId: 2, active: true };
  const context = vm.createContext({ console, Date, AbortSignal, URL,
    setInterval(callback) { timers.push(callback); return timers.length; }, clearInterval() {},
    async fetch(url, init) {
      requests.push({ url, init });
      if (helperAbsent) throw new Error('Helper absent');
      return { ok: true, async json() { return url.endsWith('/pair') ? { session: 'a'.repeat(64) } : { command: { id: 'play-1', action: 'playback' } }; } };
    },
    chrome: {
      runtime: { id: 'atlas', onMessage: { addListener(fn) { listener = fn; } } },
      tabs: { get: async () => source, query: async () => [source], sendMessage: async () => {}, onActivated: { addListener() {} } },
      windows: { get: async () => ({ focused, state: minimized ? 'minimized' : 'normal' }), onFocusChanged: { addListener() {} }, onBoundsChanged: { addListener() {} } },
      storage: { local: { set(value) { storageWrites.push(value); } } },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../desktop-captions-background.js'), 'utf8'), context);
  const sender = { id: 'atlas', tab: source, url: 'https://www.youtube.com/watch?v=test' };
  const message = { type: 'atlas-desktop-state', state: { videoId: 'test', enabled: true, playing: true, pageVisible: true, en: 'English', zh: '中文' } };
  return { requests, timers, storageWrites,
    send: (changes = {}, from = sender) => new Promise(resolve => {
      if (listener({ ...message, ...changes }, from, resolve) !== true) resolve(undefined);
    }),
  };
}

test('Atlas alone pairs and forwards bilingual state, returning native commands without storage changes', async () => {
  const h = harness();
  const response = await h.send();
  assert.equal(response.connected, true);
  assert.equal(response.command.action, 'playback');
  assert.equal(h.requests.length, 2);
  const body = JSON.parse(h.requests[1].init.body);
  assert.equal(body.sourceVisible, true);
  assert.equal(body.en, 'English');
  assert.equal(body.zh, '中文');
  assert.equal(body.tabId, 7);
  assert.equal(h.requests[1].init.headers.Authorization, `Bearer ${'a'.repeat(64)}`);
  await h.send();
  assert.equal(h.requests.filter(r => r.url.endsWith('/pair')).length, 1);
  assert.equal(h.timers.length, 1, 'one wake timer keeps paused content responsive');
  assert.deepEqual(h.storageWrites, [], 'do not overwrite user settings or notes');
});

test('the desktop bridge accepts and refreshes the bare YouTube domain', async () => {
  const h = harness();
  const bareYouTube = { id: 'atlas', tab: { id: 7, windowId: 2 }, url: 'https://youtube.com/watch?v=test' };
  const response = await h.send({}, bareYouTube);
  assert.equal(response.connected, true);
  assert.equal(h.requests.length, 2);
});

test('minimizing Chrome or switching apps makes the source invisible to the native panel', async () => {
  for (const options of [{ minimized: true }, { focused: false }]) {
    const h = harness(options);
    await h.send();
    assert.equal(JSON.parse(h.requests[1].init.body).sourceVisible, false);
  }
});

test('helper absence is silent and backs off instead of repeatedly failing', async () => {
  const h = harness({ helperAbsent: true });
  assert.equal((await h.send()).connected, undefined);
  await h.send();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.length, 0);
});

test('only Atlas YouTube content can submit desktop captions', async () => {
  const h = harness();
  for (const sender of [{ id: 'other', tab: { id: 1 }, url: 'https://www.youtube.com/' },
    { id: 'atlas', tab: { id: 1 }, url: 'https://example.com/' },
    { id: 'atlas', url: 'https://www.youtube.com/' }]) {
    assert.equal(await h.send({}, sender), undefined);
  }
  assert.equal(h.requests.length, 0);
});

test('local pairing rejects web origins, missing origin, wrong extensions and DNS rebinding', async () => {
  const { mayPair, authorized } = await import('../scripts/desktop-captions/security.mjs');
  const ids = ['a'.repeat(32)];
  const base = { host: '127.0.0.1:8792', origin: `chrome-extension://${ids[0]}` };
  assert.equal(mayPair(base, ids), true);
  for (const origin of [undefined, 'null', 'https://www.youtube.com', `chrome-extension://${'b'.repeat(32)}`]) {
    assert.equal(mayPair({ ...base, origin }, ids), false);
  }
  assert.equal(mayPair({ ...base, host: 'attacker.test:8792' }, ids), false);
  assert.equal(authorized(base, 'test-session', ids), false);
  assert.equal(authorized({ ...base, authorization: 'Bearer test-session' }, 'test-session', ids), true);
});
