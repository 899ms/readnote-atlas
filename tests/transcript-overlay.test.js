const test = require("node:test");
const assert = require("node:assert/strict");

const transcript = require("../transcript.js");

test("groups caption fragments into stable readable segments", () => {
  const grouped = transcript.groupEntries([
    { text: "The first part of a thoughtful explanation", start: 0, duration: 4 },
    { text: "continues until it becomes a complete and useful sentence.", start: 4, duration: 4 },
    { text: "A second idea is intentionally long enough to become its own readable sentence.", start: 9, duration: 5 },
  ]);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].start, 0);
  assert.match(grouped[0].text, /complete and useful sentence\.$/);
  assert.match(grouped[0].id, /^segment-0-/);
});

test("finds the segment currently spoken and tolerates a short caption gap", () => {
  const segments = [
    { id: "a", start: 0, text: "one" },
    { id: "b", start: 8, text: "two" },
    { id: "c", start: 18, text: "three" },
  ];

  assert.equal(transcript.activeSegment(segments, 12).id, "b");
  assert.equal(transcript.activeSegment(segments, 17.5).id, "b");
  assert.equal(transcript.activeSegment(segments, 45), null);
});

test("translation keys include source text so differently grouped captions cannot collide", () => {
  const first = transcript.translationKey("video123", {
    id: "segment-2-9000",
    text: "A short player caption.",
  });
  const second = transcript.translationKey("video123", {
    id: "segment-2-9000",
    text: "A longer side panel paragraph built from several captions.",
  });

  assert.match(first, /^video123:zh:semantic:segment-2-9000:/);
  assert.notEqual(first, second);
});

test("long player subtitles keep soft text so width changes can reflow lines", () => {
  const english = transcript.wrapSubtitle(
    "Most great products begin as a very specific personal need, and become useful when that need turns into a repeatable system.",
  );
  const chinese = transcript.wrapSubtitle(
    "很多优秀产品都源于一个非常具体的个人需求，而当这种需求变成可以反复使用的系统时，产品才真正有价值。",
  );

  assert.equal(english.includes("\n"), false);
  assert.match(english, /need, and/);
  assert.equal(chinese.includes("\n"), false);
  assert.match(chinese, /，而当/);
});

test("the active subtitle is translated first, then future captions prefetch", () => {
  const segments = Array.from({ length: 12 }, (_, index) => ({
    id: `segment-${index}`,
    text: `Caption ${index}`,
    translation: "",
  }));
  const pending = new Set();

  const priority = transcript.translationCandidates(segments, 3, pending, 9, 6);
  assert.deepEqual(priority.map((item) => item.id), ["segment-3"]);

  pending.add("segment-3");
  const prefetch = transcript.translationCandidates(segments, 3, pending, 9, 6);
  assert.deepEqual(
    prefetch.map((item) => item.id),
    ["segment-4", "segment-5", "segment-6", "segment-7", "segment-8", "segment-9"],
  );
});

test("persists only the 50 most recent bilingual display choices", async () => {
  const data = {};
  const storage = {
    async get(key) {
      return { [key]: data[key] };
    },
    async set(values) {
      Object.assign(data, values);
    },
  };

  for (let index = 0; index < 52; index += 1) {
    await transcript.saveDisplayMode(
      storage,
      `video-${index}`,
      index % 2 ? "off" : "bilingual",
      index,
    );
  }

  const saved = data[transcript.DISPLAY_MODE_STORAGE_KEY];
  assert.equal(Object.keys(saved).length, 50);
  assert.equal(saved["video-51"].mode, "off");
  assert.equal(saved["video-0"], undefined);
  assert.equal(saved["video-1"], undefined);
  assert.equal(await transcript.saveDisplayMode(storage, "video-x", "english"), false);
});
