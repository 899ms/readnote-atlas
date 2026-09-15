// Pure selection policy. One source, no duplicate windows, no hidden stale cue.
export function selectSource(sources, currentId, now = Date.now()) {
  const live = [...sources.values()].filter(s => now - s.receivedAt < 3500 && s.videoId);
  const eligible = live.filter(s => s.surfaceReady && (s.playing || s.keepPaused));
  return eligible.find(s => s.sourceVisible) || eligible.find(s => s.tabId === currentId) || eligible[0] ||
    live.find(s => s.tabId === currentId && s.surfaceReady) || null;
}
