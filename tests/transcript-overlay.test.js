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

test("long player subtitles split once near a natural midpoint", () => {
  const english = transcript.wrapSubtitle(
    "Most great products begin as a very specific personal need, and become useful when that need turns into a repeatable system.",
  );
  const chinese = transcript.wrapSubtitle(
    "很多优秀产品都源于一个非常具体的个人需求，而当这种需求变成可以反复使用的系统时，产品才真正有价值。",
  );

  assert.equal(english.split("\n").length, 2);
  assert.match(english, /need,\nand/);
  assert.equal(chinese.split("\n").length, 2);
  assert.match(chinese, /，\n/);
});
