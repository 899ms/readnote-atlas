const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');

function bridgeHarness() {
  const events = new Map();
  const states = [];
  const commands = [];
  let tick;
  let time = 1000;
  const video = { paused: false, ended: false, readyState: 4, currentTime: 30, duration: 100,
    async play() { this.paused = false; }, pause() { this.paused = true; } };
  const root = { dataset: { mode: 'bilingual' }, querySelector: () => ({ textContent: 'Caption' }) };
  const context = vm.createContext({ URL, location: { href: 'https://www.youtube.com/watch?v=test' },
    Date: { now: () => time },
    setInterval(handler) { tick = handler; }, clearInterval() {},
    document: { documentElement: { dataset: { readnoteCaptionOwner: 'desktop' } }, visibilityState: 'hidden', querySelector: () => video,
      getElementById: id => id === 'readnote-subtitle-root' ? root : null,
      addEventListener(name, handler) { events.set(name, handler); } },
    chrome: { runtime: { id: 'test', onMessage: { addListener() {} },
      async sendMessage(message) { states.push(message.state); return { command: commands.shift() }; } } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../desktop-captions-content.js'), 'utf8'), context);
  return { video, root, states, context,
    async tick() { await new Promise(setImmediate); await tick(); },
    async command(action, overrides = {}) {
      commands.push({ id: `${action}:${time++}`, action, videoId: 'test', createdAt: time, ...overrides });
      await this.tick();
    },
  };
}

test('desktop source remains eligible after external pause, not only a panel pause', async () => {
  const h = bridgeHarness();
  await h.tick();
  h.video.pause();
  await h.tick();
  assert.equal(h.states.at(-1).playing, false);
  assert.equal(h.states.at(-1).keepPaused, true);
  const { selectSource } = await import('../scripts/desktop-captions/state.mjs');
  const sources = new Map([[1, { ...h.states.at(-1), tabId: 1, receivedAt: 20000 }]]);
  assert.equal(selectSource(sources, 1, 20000)?.tabId, 1);
});

test('desktop pause retention resets for another video and when captions are off', async () => {
  const h = bridgeHarness();
  await h.tick();
  await h.command('playback');
  await h.tick();
  assert.equal(h.states.at(-1).keepPaused, true);
  h.context.location.href = 'https://www.youtube.com/watch?v=another';
  await h.tick();
  assert.equal(h.states.at(-1).keepPaused, false);
  h.video.paused = false;
  await h.tick();
  h.root.dataset.mode = 'off';
  h.video.pause();
  await h.tick();
  assert.equal(h.states.at(-1).keepPaused, false);
});

test('desktop seek controls clamp to the video, preserving paused state', async () => {
  const h = bridgeHarness();
  h.video.paused = true;
  await h.command('rewind');
  assert.equal(h.video.currentTime, 15);
  await h.command('forward');
  assert.equal(h.video.currentTime, 30);
  h.video.currentTime = 3;
  await h.command('rewind');
  assert.equal(h.video.currentTime, 0);
  h.video.currentTime = 95;
  await h.command('forward');
  assert.equal(h.video.currentTime, 100);
  assert.equal(h.video.paused, true);
});

test('desktop commands reject stale and wrong-video requests', async () => {
  const h = bridgeHarness();
  await h.command('forward', { videoId: 'wrong' });
  await h.command('rewind', { createdAt: -10000 });
  assert.equal(h.video.currentTime, 30);
});

test('rapid seek clicks use an acknowledged FIFO, including retries', async () => {
  const { CaptionCommands } = await import('../scripts/desktop-captions/commands.mjs');
  const q = new CaptionCommands();
  for (const id of ['first', 'second', 'third']) q.enqueue(1, { id, videoId: 'test', queuedAt: 0 });
  assert.equal(q.next(1, null, 'test', 1000).id, 'first');
  assert.equal(q.next(1, null, 'test', 2000).id, 'first', 'retry until acknowledged');
  assert.equal(q.next(1, { id: 'first' }, 'test', 3000).id, 'second');
  assert.equal(q.next(1, { id: 'second' }, 'test', 4000).id, 'third');
  assert.equal(q.next(1, { id: 'third' }, 'test', 5000), undefined);
  q.enqueue(1, { id: 'old', videoId: 'test', queuedAt: 0 });
  assert.equal(q.next(1, null, 'new-video', 5000), undefined);
  q.enqueue(1, { id: 'stale', videoId: 'test', queuedAt: 0 });
  assert.equal(q.next(1, null, 'test', 20000), undefined);
});

test('a retried command is acknowledged without seeking twice', async () => {
  const h = bridgeHarness();
  await h.command('forward', { id: 'same' });
  await h.command('forward', { id: 'same' });
  await h.tick();
  assert.equal(h.video.currentTime, 45);
  assert.equal(h.states.at(-1).result.id, 'same');
  assert.equal(h.states.at(-1).result.ok, true);
});

test('a current desktop caption binary starts without recompiling', async (t) => {
  const { needsDesktopCaptionBuild } = await import('../scripts/desktop-captions/build-state.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-caption-build-'));
  const executable = path.join(directory, 'AtlasCaptions');
  const sources = [path.join(directory, 'State.swift'), path.join(directory, 'Window.swift')];
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  for (const file of [...sources, executable]) fs.writeFileSync(file, file);
  for (const file of sources) fs.utimesSync(file, 100, 100);
  fs.utimesSync(executable, 200, 200);

  assert.equal(needsDesktopCaptionBuild(executable, sources), false);
  fs.utimesSync(sources[1], 300, 300);
  assert.equal(needsDesktopCaptionBuild(executable, sources), true);
  fs.unlinkSync(executable);
  assert.equal(needsDesktopCaptionBuild(executable, sources), true);
});
