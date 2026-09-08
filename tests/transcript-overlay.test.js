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

test("uses the same stable translation key in the panel and player", () => {
  assert.equal(
    transcript.translationKey("video123", { id: "segment-2-9000" }),
    "video123:zh:semantic:segment-2-9000",
  );
});
