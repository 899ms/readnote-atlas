const test = require("node:test");
const assert = require("node:assert/strict");

const knowledge = require("../knowledge.js");

test("maps a timestamped video note to the shared knowledge excerpt model", () => {
  const excerpt = knowledge.noteToExcerpt({
    id: "note_1",
    text: "A durable idea.",
    videoTitle: "The Long Interview",
    channelName: "Example Channel",
    personalNote: "Connect this to durable learning.",
    timestamp: "12:34",
    timestampedUrl: "https://youtube.com/watch?v=abc123&t=754s",
    createdAt: Date.parse("2026-09-08T01:00:00.000Z"),
  });

  assert.deepEqual(excerpt, {
    id: "note_1",
    sourceId: "youtube:abc123",
    sourceTitle: "The Long Interview",
    sourceUrl: "https://youtube.com/watch?v=abc123&t=754s",
    text: "A durable idea.",
    note: "Connect this to durable learning.",
    translation: "",
    createdAt: "2026-09-08T01:00:00.000Z",
  });
});

test("normalizes companion results into a compact sync state", () => {
  assert.deepEqual(
    knowledge.syncState({ ok: true, obsidian: "synced", notion: "synced" }),
    { status: "synced", obsidian: "synced", notion: "synced" },
  );
  assert.equal(knowledge.syncState(null).status, "unavailable");
});
