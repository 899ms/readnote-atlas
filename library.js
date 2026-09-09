(function initReadnoteLibrary(root, factory) {
  const api = factory();
  root.ReadnoteLibrary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLibrary() {
  "use strict";

  const STORAGE_KEY = "readnote_video_library_v1";
  const WATCHED_THRESHOLD_SECONDS = 10 * 60;
  const MAX_ITEMS = 200;
  const MAX_PARTIAL_ITEMS = 100;

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeItem(value) {
    if (
      !value ||
      typeof value.videoId !== "string" ||
      !/^[A-Za-z0-9_-]{3,128}$/.test(value.videoId.trim())
    ) {
      return null;
    }
    const videoId = value.videoId.trim();
    const watchedSeconds = Math.max(0, finiteNumber(value.watchedSeconds));
    return {
      videoId,
      title: String(value.title || "Untitled video").trim().slice(0, 500),
      channelName: String(value.channelName || "").trim().slice(0, 300),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: Math.max(0, finiteNumber(value.duration)),
      watchedSeconds,
      lastPosition: Math.max(0, finiteNumber(value.lastPosition)),
      lastWatchedAt: Math.max(0, finiteNumber(value.lastWatchedAt)),
      qualifiedAt:
        watchedSeconds >= WATCHED_THRESHOLD_SECONDS
          ? Math.max(0, finiteNumber(value.qualifiedAt, value.lastWatchedAt))
          : 0,
    };
  }

  function normalize(value) {
    const source = Array.isArray(value?.items) ? value.items : [];
    const seen = new Set();
    const items = [];
    for (const rawItem of source) {
      const item = normalizeItem(rawItem);
      if (!item || seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      items.push(item);
    }
    items.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
    const qualified = items
      .filter((item) => item.watchedSeconds >= WATCHED_THRESHOLD_SECONDS)
      .slice(0, MAX_ITEMS);
    const partial = items
      .filter((item) => item.watchedSeconds < WATCHED_THRESHOLD_SECONDS)
      .slice(0, MAX_PARTIAL_ITEMS);
    return {
      version: 1,
      items: [...qualified, ...partial].sort(
        (a, b) => b.lastWatchedAt - a.lastWatchedAt,
      ),
    };
  }

  function recordWatchSample(value, video, watchedDelta, now = Date.now()) {
    const library = normalize(value);
    const videoId = String(video?.videoId || "").trim();
    const delta = Math.max(0, finiteNumber(watchedDelta));
    if (!videoId || delta <= 0) return library;

    const previous = library.items.find((item) => item.videoId === videoId);
    const watchedSeconds = (previous?.watchedSeconds || 0) + delta;
    const crossedThreshold =
      watchedSeconds >= WATCHED_THRESHOLD_SECONDS &&
      (previous?.watchedSeconds || 0) < WATCHED_THRESHOLD_SECONDS;
    const item = normalizeItem({
      ...previous,
      ...video,
      videoId,
      watchedSeconds,
      lastWatchedAt: Math.max(0, finiteNumber(now, Date.now())),
      qualifiedAt: crossedThreshold
        ? Math.max(0, finiteNumber(now, Date.now()))
        : previous?.qualifiedAt,
    });

    return normalize({
      version: 1,
      items: [item, ...library.items.filter((entry) => entry.videoId !== videoId)],
    });
  }

  function qualifiedItems(value) {
    return normalize(value).items.filter(
      (item) => item.watchedSeconds >= WATCHED_THRESHOLD_SECONDS,
    );
  }

  function formatWatchTime(seconds) {
    const minutes = Math.max(0, Math.floor(finiteNumber(seconds) / 60));
    if (minutes < 60) return `${minutes} min watched`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m watched` : `${hours}h watched`;
  }

  return {
    STORAGE_KEY,
    WATCHED_THRESHOLD_SECONDS,
    MAX_ITEMS,
    MAX_PARTIAL_ITEMS,
    normalize,
    recordWatchSample,
    qualifiedItems,
    formatWatchTime,
  };
});
