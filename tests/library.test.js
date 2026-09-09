const test = require("node:test");
const assert = require("node:assert/strict");

const library = require("../library.js");

const video = {
  videoId: "atlas123",
  title: "A long English interview",
  channelName: "Example",
  url: "https://www.youtube.com/watch?v=atlas123",
  duration: 3600,
  lastPosition: 720,
};

test("a video enters the library only after ten cumulative watched minutes", () => {
  const first = library.recordWatchSample(null, video, 599, 1000);
  assert.equal(library.qualifiedItems(first).length, 0);

  const second = library.recordWatchSample(first, video, 1, 2000);
  assert.equal(library.qualifiedItems(second).length, 1);
  assert.equal(second.items[0].watchedSeconds, 600);
  assert.equal(second.items[0].qualifiedAt, 2000);
});

test("watch progress accumulates without counting arbitrary seek distance", () => {
  const first = library.recordWatchSample(null, video, 12, 1000);
  const second = library.recordWatchSample(
    first,
    { ...video, lastPosition: 2400 },
    8,
    2000,
  );
  assert.equal(second.items[0].watchedSeconds, 20);
  assert.equal(second.items[0].lastPosition, 2400);
});

test("library output is normalized, newest first, and human readable", () => {
  const older = library.recordWatchSample(null, video, 600, 1000);
  const newer = library.recordWatchSample(
    older,
    { ...video, videoId: "newer", title: "Newer" },
    610,
    2000,
  );
  assert.deepEqual(
    library.qualifiedItems(newer).map((item) => item.videoId),
    ["newer", "atlas123"],
  );
  assert.equal(library.formatWatchTime(610), "10 min watched");
  assert.equal(library.formatWatchTime(3900), "1h 5m watched");
});
