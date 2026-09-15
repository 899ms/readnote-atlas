// Disposable sidecar: reads only Atlas's already-rendered captions on YouTube.
// No translation calls, keys, document scraping, or changes to Atlas storage.
(() => {
  if (globalThis.__atlasDesktopPrototype) return;
  globalThis.__atlasDesktopPrototype = true;
  let inFlight = false;
  let keepPaused = false;
  let lastVideoId = "";
  let result = null;
  const processed = new Map();

  async function runCommand(command, video, videoId) {
    if (processed.has(command.id)) { result = processed.get(command.id); return; }
    if (processed.size > 100) processed.delete(processed.keys().next().value);
    result = { id: command.id, ok: false };
    processed.set(command.id, result);
    if (!video || videoId !== command.videoId || Date.now() - command.createdAt > 4000) return;
    if (command.action === "playback") {
      if (video.paused) {
        await video.play();
        keepPaused = true;
      } else {
        keepPaused = true;
        video.pause();
      }
      result.ok = true;
    } else if (command.action === "rewind" || command.action === "forward") {
      if (!Number.isFinite(video.duration)) return;
      const delta = command.action === "rewind" ? -15 : 15;
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
      result.ok = true;
    } else if (command.action === "bookmark") {
      // Use the existing app's save path, not a second notebook or fake saved state.
      if (Math.abs(video.currentTime - command.time) > 4) return;
      const button = document.getElementById("ytd-note-button");
      if (!button) return;
      const previousToast = document.getElementById("ytd-note-toast");
      button.click();
      result = await new Promise(resolve => {
        const started = Date.now();
        const timer = setInterval(() => {
          const toast = document.getElementById("ytd-note-toast");
          const ok = toast && toast !== previousToast && toast.textContent.includes("Bookmark saved");
          if (ok || Date.now() - started > 3000) {
            clearInterval(timer);
            resolve({ id: command.id, ok: Boolean(ok) });
          }
        }, 100);
      });
      processed.set(command.id, result);
    }
  }

  async function tick() {
    if (inFlight || !chrome.runtime?.id) return;
    inFlight = true;
    try {
      const videoId = new URL(location.href).searchParams.get("v") || "";
      if (lastVideoId !== videoId) { keepPaused = false; lastVideoId = videoId; }
      const video = document.querySelector("video.html5-main-video");
      const root = document.getElementById("readnote-subtitle-root");
      const enabled = Boolean(root?.dataset.mode === "bilingual" && videoId && video);
      // Retain a source that has played regardless of where it was paused.
      // The native window independently decides whether it was already shown.
      if (!enabled) keepPaused = false;
      else if (!video.paused) keepPaused = true;
      const state = {
        videoId,
        enabled,
        surfaceReady: document.documentElement.dataset.readnoteCaptionOwner === "desktop",
        en: root?.querySelector(".rn-subtitle-original")?.textContent || "",
        zh: root?.querySelector(".rn-subtitle-zh")?.textContent || "",
        playing: Boolean(enabled && !video.paused && !video.ended && video.readyState >= 2),
        keepPaused: Boolean(enabled && video.paused && keepPaused),
        pageVisible: document.visibilityState === "visible",
        time: video?.currentTime || 0,
        result,
      };
      const reply = await chrome.runtime.sendMessage({ type: "desktop-prototype-state", state });
      if (reply?.connected) document.dispatchEvent(new Event("readnote-desktop-connected"));
      result = null;
      if (reply?.command) await runCommand(reply.command, video, videoId);
    } catch (_) { /* Helper absent or extension reload: leave Atlas untouched. */ }
    finally { inFlight = false; }
  }

  setInterval(tick, 300);
  document.addEventListener("visibilitychange", tick);
  ["play", "pause", "seeked", "timeupdate", "ended"].forEach(name => document.addEventListener(name, tick, true));
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === "desktop-prototype-refresh") void tick();
  });
  void tick();
})();
