/**
 * CONTENT SCRIPT
 *
 * This script runs ON the YouTube page itself. It can see and modify
 * the YouTube page DOM (the HTML elements).
 *
 * It handles:
 * 1. Extracting video info (title, channel name) from the page
 * 2. Showing a bilingual subtitle layer over the player
 * 3. Adding a Readnote button to YouTube's action bar
 *
 * Think of it like a robot sitting inside the YouTube tab,
 * reading the page and making small visual changes.
 */

const DEBUG = false;
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

// ============================================================
// GLOBAL STATE
// ============================================================

let ytdNoteButton = null;
let ytdNoteButtonTimer = null;
let ytdNoteKeyboardListenerAdded = false;
let ytdNoteButtonRetryTimer = null;
let ytdDigestButton = null;
let digestButtonObserver = null;
let digestButtonReconcileTimer = null;
let digestButtonResizeListenerAdded = false;
let readnoteSubtitleRoot = null;
let readnoteSubtitleSegments = [];
let readnoteSubtitleMode = "bilingual";
let readnoteSubtitleVideo = null;
let readnoteSubtitleTimeListener = null;
let readnoteSubtitleSeekListener = null;
let readnoteSubtitleRefreshTimer = null;
let readnoteSubtitleRetryTimer = null;
let readnoteSubtitlePrefetchTimer = null;
let readnoteSubtitleActiveId = "";
let readnoteSubtitleTranslationError = "";
let readnoteBackgroundCaptionWindow = null;
let readnoteBackgroundCaptionVideo = null;
let readnoteBackgroundCaptionLayout = "A";
let readnoteBackgroundCaptionVisibilityListenerAdded = false;
const readnoteSubtitleTranslationRequests = new Set();
const readnoteSubtitleUrgentRequests = new Set();
const readnoteSubtitlePrefetchInflight = new Map();
const SUBTITLE_PREFETCH_BATCH_SIZE = 6;
const SUBTITLE_PREFETCH_WINDOW = 96;
const SUBTITLE_PREFETCH_SECONDS = 180;
const MAX_SUBTITLE_PREFETCH_REQUESTS = 3;
const SUBTITLE_PREFETCH_DELAY_MS = 250;
let readnoteSubtitleTranslationGeneration = 0;
const SUBTITLE_STYLE_STORAGE_KEY = "readnote_subtitle_style_v6";
const BACKGROUND_CAPTION_LAYOUT_STORAGE_KEY = "readnote_background_caption_layout_v1";
let readnoteSubtitleStyle = {
  size: "medium",
  x: 50,
  y: 80,
  width: "auto",
};
let watchHistoryTracker = null;
let watchHistoryTimer = null;
let watchHistoryListenersAdded = false;
const WATCH_HISTORY_FLUSH_SECONDS = 10;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * When the page loads, inject our Digest button and Note button.
 * We wait a bit for YouTube's UI to fully render.
 */
function init() {
  // Register the global "n" keyboard shortcut once
  if (!ytdNoteKeyboardListenerAdded) {
    document.addEventListener("keydown", handleNoteKeyboardShortcut);
    ytdNoteKeyboardListenerAdded = true;
  }

  // Try to inject the buttons immediately
  injectDigestButton();
  tryInjectNoteButton();
  setupReadnoteSubtitles();
  setupWatchHistoryTracking();

  // Also set up an observer to handle YouTube's dynamic content loading
  // (YouTube is an SPA, so elements appear/disappear as you navigate)
  setupButtonObserver();
  setupDigestButtonResizeListener();
}

// Persist partial progress when the tab goes into the background. Hidden or
// paused time is deliberately excluded from the ten-minute album threshold.
function setupWatchHistoryPageListeners() {
  if (watchHistoryListenersAdded) return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushWatchHistoryProgress();
    if (watchHistoryTracker) watchHistoryTracker.lastTick = performance.now();
  });
  window.addEventListener("pagehide", () => {
    void flushWatchHistoryProgress();
  });
  watchHistoryListenersAdded = true;
}

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const videoId = currentReadnoteVideoId();
  const modes = changes[ReadnoteTranscript.DISPLAY_MODE_STORAGE_KEY]?.newValue;
  const mode = modes?.[videoId]?.mode;
  if (!videoId || !ReadnoteTranscript.isDisplayMode(mode)) return;
  readnoteSubtitleMode = mode;
  updateReadnoteSubtitleControls();
  renderReadnoteSubtitle();
});

/**
 * Attempts to inject the note button. If the player container isn't ready yet,
 * retry a few times with a short delay. YouTube renders the player asynchronously
 * after navigation, so a single immediate attempt can miss it.
 */
function tryInjectNoteButton() {
  if (!window.location.pathname.includes("/watch")) return;

  // Clear any existing retry so we don't stack timers
  if (ytdNoteButtonRetryTimer) {
    clearInterval(ytdNoteButtonRetryTimer);
    ytdNoteButtonRetryTimer = null;
  }

  let attempts = 0;
  const maxAttempts = 30; // ~3 seconds of retrying

  function attempt() {
    attempts++;
    const playerContainer = document.querySelector(
      "#movie_player.html5-video-player, #movie_player, .html5-video-player",
    );

    if (playerContainer) {
      injectNoteButton();
      if (ytdNoteButtonRetryTimer) {
        clearInterval(ytdNoteButtonRetryTimer);
        ytdNoteButtonRetryTimer = null;
      }
      return;
    }

    if (attempts >= maxAttempts) {
      debugLog(
        "[Readnote Atlas Content] Player container not found after retries, giving up",
      );
      if (ytdNoteButtonRetryTimer) {
        clearInterval(ytdNoteButtonRetryTimer);
        ytdNoteButtonRetryTimer = null;
      }
    }
  }

  attempt();
  if (!ytdNoteButton || !ytdNoteButton.isConnected) {
    ytdNoteButtonRetryTimer = setInterval(attempt, 100);
  }
}

// Run init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ============================================================
// MESSAGE HANDLING
// ============================================================

/**
 * Listen for messages from the side panel or background script.
 * When they ask for video info, we read it from the page.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("[Readnote Atlas Content] Received message:", message.action, message);

  if (message.action === "getVideoInfo") {
    // Read video title and channel name from the page
    const info = extractVideoInfo();
    debugLog("[Readnote Atlas Content] Returning video info:", info);
    sendResponse(info);
    return false; // Synchronous response
  }

  if (message.action === "getCurrentTime") {
    // Return the current video playback time (used by auto-scroll)
    const video = document.querySelector("video.html5-main-video");
    sendResponse({
      currentTime: video ? Math.floor(video.currentTime) : 0,
      paused: video ? video.paused : true,
    });
    return false;
  }

  if (message.action === "getBackgroundCaptionState") {
    const video = document.querySelector("video.html5-main-video");
    const videoId = currentReadnoteVideoId();
    const currentTime = video ? Number(video.currentTime) || 0 : 0;
    const isPlaying = Boolean(videoId && video && !video.paused && !video.ended);
    const segment = isPlaying ? ReadnoteTranscript.activeSegment(readnoteSubtitleSegments, currentTime) : null;
    if (isPlaying && segment && readnoteSubtitleMode === "bilingual") {
      const index = readnoteSubtitleSegments.findIndex((item) => item.id === segment.id);
      if (index >= 0) {
        requestReadnoteActiveTranslation(index);
        scheduleReadnoteSubtitlePrefetch(index, 0);
      }
    }
    sendResponse({
      active: Boolean(isPlaying && readnoteSubtitleMode === "bilingual"),
      videoId: videoId || "",
      currentTime,
      title: document.title.replace(/\s+-\s+YouTube\s*$/i, "").trim(),
      cue: segment ? { en: segment.text || "", zh: segment.translation || segment.partialTranslation || "Generating Chinese…" } : null,
    });
    return false;
  }

  if (message.action === "seekTo") {
    // Jump the video to a specific timestamp
    debugLog("[Readnote Atlas Content] Seeking to:", message.seconds);
    seekToTimestamp(message.seconds);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "showNoteSavedFeedback") {
    // Show brief feedback that note was saved
    showNoteSavedToast(message.note);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "refreshSubtitleOverlay") {
    refreshReadnoteSubtitleState();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "subtitleTranslationPartial") {
    if (
      message.videoId !== currentReadnoteVideoId() ||
      message.generation !== readnoteSubtitleTranslationGeneration
    ) {
      sendResponse({ success: false, stale: true });
      return false;
    }
    const segment = readnoteSubtitleSegments.find(
      (item) => item.id === message.segmentId,
    );
    if (segment && !segment.translation && typeof message.translation === "string") {
      segment.partialTranslation = message.translation.trim();
      if (segment.id === readnoteSubtitleActiveId) renderReadnoteSubtitle();
    }
    sendResponse({ success: true });
    return false;
  }

  // Unknown action - still send a response to prevent hanging
  debugLog("[Readnote Atlas Content] Unknown action:", message.action);
  sendResponse({ success: false, error: "Unknown action" });
  return false;
});

// ============================================================
// DIGEST BUTTON INJECTION
// ============================================================

/**
 * Injects a "Digest" button into YouTube's action bar.
 * The button appears next to Share, Save, etc. below the video.
 *
 * When clicked, it opens the Readnote Atlas side panel.
 */
function isVisibleDigestHost(element) {
  if (!element || !element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * YouTube keeps hidden copies of its responsive action toolbar in the DOM.
 * querySelector() can return one of those 0x0 copies before the toolbar the
 * viewer can actually see, so inspect every candidate and resolve the native
 * button group inside the visible action row for the current video.
 */
function findDigestButtonHost() {
  const primaryActionRows = Array.from(
    document.querySelectorAll("ytd-watch-metadata #actions-inner"),
  );

  for (const actionRow of primaryActionRows) {
    if (!isVisibleDigestHost(actionRow)) continue;

    const visibleButtonGroup = Array.from(
      actionRow.querySelectorAll("#top-level-buttons-computed"),
    ).find(isVisibleDigestHost);
    if (visibleButtonGroup) return visibleButtonGroup;
  }

  const fallbackCandidates = Array.from(
    document.querySelectorAll(
      "ytd-watch-metadata #actions #top-level-buttons-computed, " +
        "ytd-watch-metadata #top-level-buttons-computed, " +
        "#primary #actions #top-level-buttons-computed",
    ),
  );

  return (
    fallbackCandidates.find(
      (candidate) =>
        isVisibleDigestHost(candidate) &&
        (candidate.closest("ytd-watch-metadata") ||
          candidate.closest("#primary")),
    ) || null
  );
}

function createDigestButton() {
  const digestButton = document.createElement("button");
  digestButton.id = "ytd-digest-button";
  digestButton.type = "button";
  digestButton.setAttribute("aria-label", "Open Readnote Atlas");
  digestButton.innerHTML = `<span class="ytd-digest-label">Readnote</span>`;

  // Compact Readnote action, sized to sit with YouTube's native controls.
  digestButton.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 18px;
    height: 36px;
    border: none;
    border-radius: 18px;
    background: #0969da;
    color: white;
    font-family: "Roboto", "Arial", sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    margin-right: 8px;
    transition: background 0.2s, transform 0.1s;
    flex: 0 0 auto;
    align-self: center;
    width: max-content;
    min-width: max-content;
    max-width: max-content;
    white-space: nowrap;
  `;

  // Hover effects
  digestButton.addEventListener("mouseenter", () => {
    digestButton.style.background = "#0550ae";
    digestButton.style.transform = "scale(1.02)";
  });

  digestButton.addEventListener("mouseleave", () => {
    digestButton.style.background = "#0969da";
    digestButton.style.transform = "scale(1)";
  });

  // Click handler — open the side panel
  digestButton.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    debugLog("[Readnote Atlas] Digest button clicked");

    // Send message to background script to open side panel
    try {
      const result = await chrome.runtime.sendMessage({
        action: "openSidePanel",
      });
      debugLog("[Readnote Atlas] openSidePanel response:", result);
    } catch (err) {
      debugLog("[Readnote Atlas] Side panel unavailable:", err);
    }
  });

  ytdDigestButton = digestButton;
  return digestButton;
}

/**
 * Reconciles the Digest button with YouTube's currently visible action row.
 * This is intentionally idempotent because YouTube rebuilds its watch page
 * during navigation and at responsive breakpoints.
 */
function injectDigestButton() {
  const existingButtons = Array.from(
    document.querySelectorAll("#ytd-digest-button"),
  );

  if (!window.location.pathname.includes("/watch")) {
    existingButtons.forEach((button) => button.remove());
    ytdDigestButton = null;
    return false;
  }

  const actionsContainer = findDigestButtonHost();
  if (!actionsContainer) {
    debugLog("[Readnote Atlas Content] Visible actions container not found yet");
    return false;
  }

  let digestButton = existingButtons.find(
    (button) => button === ytdDigestButton,
  );

  if (!digestButton) {
    existingButtons.forEach((button) => button.remove());
    existingButtons.length = 0;
    digestButton = createDigestButton();
  }

  existingButtons.forEach((button) => {
    if (button !== digestButton) button.remove();
  });

  if (digestButton.parentElement !== actionsContainer) {
    // YouTube turns #actions-inner into a vertical flex column at narrow
    // breakpoints. A direct child there stretches into a full-width second
    // row, so keep Digest inside the native horizontal button group and
    // prepend it to preserve visibility when space is limited.
    actionsContainer.insertBefore(digestButton, actionsContainer.firstChild);
  }

  debugLog("[Readnote Atlas Content] Digest button reconciled");
  return true;
}

function scheduleDigestButtonReconciliation(delay = 80) {
  if (digestButtonReconcileTimer) {
    clearTimeout(digestButtonReconcileTimer);
  }

  digestButtonReconcileTimer = setTimeout(() => {
    digestButtonReconcileTimer = null;
    injectDigestButton();
  }, delay);
}

function setupDigestButtonResizeListener() {
  if (digestButtonResizeListenerAdded) return;

  window.addEventListener("resize", () => {
    scheduleDigestButtonReconciliation(120);
  });
  digestButtonResizeListenerAdded = true;
}

/**
 * Sets up a MutationObserver to watch for YouTube's dynamic content changes.
 * When the action buttons container appears (after navigation), we inject our button.
 */
function setupButtonObserver() {
  if (digestButtonObserver) return;

  digestButtonObserver = new MutationObserver(() => {
    // Check if we need to inject the buttons
    if (window.location.pathname.includes("/watch")) {
      scheduleDigestButtonReconciliation();
      setupWatchHistoryTracking();
      if (!ytdNoteButton || !ytdNoteButton.isConnected) {
        tryInjectNoteButton();
      }
    }
  });

  // Watch the entire body for changes (YouTube rebuilds large chunks of the DOM)
  digestButtonObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================
// READNOTE BILINGUAL SUBTITLES
// ============================================================

function currentReadnoteVideoId() {
  if (!window.location.pathname.includes("/watch")) return "";
  if (typeof URLSearchParams === "undefined") return "";
  return new URLSearchParams(window.location.search).get("v") || "";
}

function setupReadnoteSubtitles() {
  const videoId = currentReadnoteVideoId();
  if (!videoId) return;
  cleanupReadnoteSubtitles();

  let attempts = 0;
  const attempt = () => {
    attempts += 1;
    const player = document.querySelector(
      "#movie_player.html5-video-player, #movie_player, .html5-video-player",
    );
    const video = document.querySelector("video.html5-main-video");
    if (!player || !video) {
      if (attempts >= 40 && readnoteSubtitleRetryTimer) {
        clearInterval(readnoteSubtitleRetryTimer);
        readnoteSubtitleRetryTimer = null;
      }
      return;
    }

    if (readnoteSubtitleRetryTimer) {
      clearInterval(readnoteSubtitleRetryTimer);
      readnoteSubtitleRetryTimer = null;
    }
    injectReadnoteSubtitleOverlay(player);
    void loadReadnoteSubtitleStyle();
    readnoteSubtitleVideo = video;
    readnoteSubtitleTimeListener = () => renderReadnoteSubtitle();
    readnoteSubtitleSeekListener = () => {
      readnoteSubtitleTranslationGeneration += 1;
      clearTimeout(readnoteSubtitlePrefetchTimer);
      readnoteSubtitlePrefetchTimer = null;
      renderReadnoteSubtitle(true);
    };
    video.addEventListener("timeupdate", readnoteSubtitleTimeListener);
    video.addEventListener("seeking", readnoteSubtitleSeekListener);
    setupReadnoteBackgroundCaptionSync(video);
    void refreshReadnoteSubtitleState();
  };

  attempt();
  if (!readnoteSubtitleRoot) {
    readnoteSubtitleRetryTimer = setInterval(attempt, 150);
  }
}

function injectReadnoteSubtitleOverlay(player) {
  document.getElementById("readnote-subtitle-root")?.remove();
  document.getElementById("readnote-subtitle-style")?.remove();
  const style = document.createElement("style");
  style.id = "readnote-subtitle-style";
  style.textContent = `
    #readnote-subtitle-root { position:absolute; inset:0; z-index:9998; pointer-events:none; font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif; }
    #readnote-subtitle-root .rn-subtitle-copy { position:absolute; left:var(--rn-subtitle-x,50%); top:var(--rn-subtitle-y,80%); width:var(--rn-subtitle-width,max-content); max-width:86%; padding:8px 18px 9px; border:1px solid transparent; border-radius:10px; box-sizing:border-box; transform:translate3d(-50%,-50%,0); display:flex; flex-direction:column; gap:4px; align-items:center; text-align:center; background:rgba(7,7,8,.64); box-shadow:0 4px 18px rgba(0,0,0,.16); backdrop-filter:blur(3px); transition:opacity .16s ease,border-color .16s ease; pointer-events:auto; cursor:grab; touch-action:none; user-select:none; }
    #readnote-subtitle-root .rn-subtitle-copy:hover { border-color:rgba(255,255,255,.32); }
    #readnote-subtitle-root .rn-subtitle-copy.is-dragging { cursor:grabbing; }
    #readnote-subtitle-root .rn-subtitle-line { width:100%; max-width:100%; padding:0; background:transparent; color:#fff; font-size:clamp(16px,1.45vw,24px); line-height:1.32; letter-spacing:.005em; text-align:center; white-space:normal; overflow-wrap:break-word; text-wrap:balance; text-shadow:0 2px 4px rgba(0,0,0,.82); pointer-events:none; }
    #readnote-subtitle-root .rn-subtitle-line:empty { display:none; }
    #readnote-subtitle-root .rn-subtitle-zh { color:#fff7dc; font-size:clamp(15px,1.38vw,23px); font-weight:550; }
    #readnote-subtitle-root .rn-subtitle-zh.is-pending { color:rgba(255,247,220,.68); }
    #readnote-subtitle-root .rn-subtitle-controls { position:absolute; top:14px; left:14px; display:flex; padding:3px; gap:2px; border:1px solid rgba(255,255,255,.18); border-radius:9px; background:rgba(15,15,16,.72); opacity:0; pointer-events:auto; backdrop-filter:blur(14px); transition:opacity .18s ease; }
    #movie_player:hover #readnote-subtitle-root .rn-subtitle-controls, #readnote-subtitle-root .rn-subtitle-controls:focus-within { opacity:1; }
    #readnote-subtitle-root .rn-subtitle-settings { display:flex; gap:3px; align-items:center; }
    #readnote-subtitle-root .rn-subtitle-controls:not(.is-expanded) .rn-subtitle-settings { display:none; }
    #readnote-subtitle-root .rn-subtitle-controls-toggle { display:flex; min-width:48px; gap:5px; padding:0 8px; align-items:center; color:white; }
    #readnote-subtitle-root .rn-subtitle-controls-toggle svg { width:13px; height:13px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; }
    #readnote-subtitle-root .rn-subtitle-mode { min-width:42px; height:28px; padding:0 9px; border:0; border-radius:7px; background:transparent; color:rgba(255,255,255,.72); font:600 11px/1 Inter,system-ui,sans-serif; cursor:pointer; }
    #readnote-subtitle-root .rn-subtitle-mode[aria-pressed="true"] { background:#0969da; color:white; }
    #readnote-subtitle-root .rn-subtitle-background-layout { min-width:27px; width:27px; padding:0; }
    #readnote-subtitle-root .rn-subtitle-divider { width:1px; height:18px; align-self:center; background:rgba(255,255,255,.18); }
    #readnote-subtitle-root[data-size="small"] .rn-subtitle-line { font-size:clamp(14px,1.2vw,20px); }
    #readnote-subtitle-root[data-size="large"] .rn-subtitle-line { font-size:clamp(18px,1.75vw,28px); }
    #readnote-subtitle-root .rn-subtitle-size-label { padding:0 3px 0 6px; color:rgba(255,255,255,.58); font:600 10px/1 Inter,system-ui,sans-serif; }
    #readnote-subtitle-root .rn-subtitle-size { min-width:28px; width:28px; padding:0; font-size:16px; }
    #readnote-subtitle-root .rn-subtitle-resize { position:absolute; right:-9px; bottom:-9px; width:24px; height:24px; padding:0; border:0; background:transparent; cursor:nwse-resize; opacity:0; transition:opacity .16s ease; pointer-events:auto; touch-action:none; }
    #readnote-subtitle-root .rn-subtitle-copy:hover .rn-subtitle-resize, #readnote-subtitle-root .rn-subtitle-copy.is-dragging .rn-subtitle-resize { opacity:1; }
    #readnote-subtitle-root .rn-subtitle-resize::after { content:""; position:absolute; right:5px; bottom:5px; width:9px; height:9px; border-right:2px solid #fff; border-bottom:2px solid #fff; filter:drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
    #readnote-subtitle-root[data-mode="off"] .rn-subtitle-copy { opacity:0; }
    #readnote-subtitle-root[data-mode="off"] .rn-subtitle-copy { pointer-events:none; }
    #readnote-subtitle-root[data-mode="off"] .rn-subtitle-controls { opacity:1; }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "readnote-subtitle-root";
  root.dataset.mode = readnoteSubtitleMode;
  root.innerHTML = `
    <div class="rn-subtitle-copy" aria-live="off">
      <div class="rn-subtitle-line rn-subtitle-original"></div>
      <div class="rn-subtitle-line rn-subtitle-zh"></div>
      <button class="rn-subtitle-resize" type="button" data-resize-handle aria-label="Resize bilingual subtitles" title="Drag to resize"></button>
    </div>
    <div class="rn-subtitle-controls" role="group" aria-label="Readnote subtitle display">
      <button class="rn-subtitle-mode rn-subtitle-controls-toggle" type="button" data-controls-toggle aria-expanded="false" title="Subtitle settings">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h8M12 4h2M2 8h2M6 8h8M2 12h6M10 12h4"></path><circle cx="11" cy="4" r="1"></circle><circle cx="5" cy="8" r="1"></circle><circle cx="9" cy="12" r="1"></circle></svg>
        <span>Captions</span>
      </button>
      <div class="rn-subtitle-settings">
        <button class="rn-subtitle-mode" type="button" data-mode="bilingual">On</button>
        <button class="rn-subtitle-mode" type="button" data-mode="off">Off</button>
        <span class="rn-subtitle-divider" aria-hidden="true"></span>
        <span class="rn-subtitle-size-label">Size</span>
        <button class="rn-subtitle-mode rn-subtitle-size" type="button" data-style-action="smaller" aria-label="Decrease caption size" title="Decrease size">−</button>
        <button class="rn-subtitle-mode rn-subtitle-size" type="button" data-style-action="larger" aria-label="Increase caption size" title="Increase size">+</button>
        <span class="rn-subtitle-divider" aria-hidden="true"></span>
        <span class="rn-subtitle-size-label">Float</span>
        <button class="rn-subtitle-mode rn-subtitle-background-layout" type="button" data-background-layout="A" aria-label="Bottom-right floating captions" title="Bottom-right floating captions">A</button>
        <button class="rn-subtitle-mode rn-subtitle-background-layout" type="button" data-background-layout="B" aria-label="Centered floating captions" title="Centered floating captions">B</button>
        <button class="rn-subtitle-mode" type="button" data-background-captions aria-label="Open background captions" title="Open captions for background listening">Open</button>
      </div>
    </div>
  `;
  root.querySelector("[data-controls-toggle]").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const controls = root.querySelector(".rn-subtitle-controls");
    setReadnoteSubtitleControlsExpanded(!controls.classList.contains("is-expanded"));
  });
  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const mode = button.dataset.mode;
      const videoId = currentReadnoteVideoId();
      if (!videoId || !ReadnoteTranscript.isDisplayMode(mode)) return;
      readnoteSubtitleMode = mode;
      updateReadnoteSubtitleControls();
      renderReadnoteSubtitle();
      await chrome.runtime.sendMessage({ action: "setOverlayMode", videoId, mode });
      setReadnoteSubtitleControlsExpanded(false);
    });
  });
  root.querySelectorAll("[data-style-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateReadnoteSubtitleStyle(button.dataset.styleAction);
    });
  });
  root.querySelectorAll("[data-background-layout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      readnoteBackgroundCaptionLayout = button.dataset.backgroundLayout === "B" ? "B" : "A";
      updateReadnoteBackgroundCaptionControls();
      void chrome.storage.local.set({ [BACKGROUND_CAPTION_LAYOUT_STORAGE_KEY]: readnoteBackgroundCaptionLayout });
      syncReadnoteBackgroundCaption();
    });
  });
  root.querySelector("[data-background-captions]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openReadnoteBackgroundCaptions();
  });
  setupReadnoteSubtitleTransform(root.querySelector(".rn-subtitle-copy"), player);
  root.querySelector(".rn-subtitle-copy").addEventListener("dblclick", () => {
    readnoteSubtitleStyle = normalizeReadnoteSubtitleStyle(null);
    applyReadnoteSubtitleStyle();
    void chrome.storage.local.set({ [SUBTITLE_STYLE_STORAGE_KEY]: readnoteSubtitleStyle });
  });
  player.appendChild(root);
  readnoteSubtitleRoot = root;
  updateReadnoteSubtitleControls();
  applyReadnoteSubtitleStyle();
}

function setReadnoteSubtitleControlsExpanded(expanded) {
  if (!readnoteSubtitleRoot) return;
  const controls = readnoteSubtitleRoot.querySelector(".rn-subtitle-controls");
  const toggle = readnoteSubtitleRoot.querySelector("[data-controls-toggle]");
  controls?.classList.toggle("is-expanded", expanded);
  toggle?.setAttribute("aria-expanded", String(expanded));
}

function normalizeReadnoteSubtitleStyle(value) {
  const legacyY = { low: 78, middle: 70, high: 62 }[value?.position];
  const clamp = (number, min, max, fallback) =>
    Number.isFinite(Number(number))
      ? Math.min(max, Math.max(min, Number(number)))
      : fallback;
  const width = value?.width === "auto" || !Number.isFinite(Number(value?.width))
    ? "auto"
    : clamp(value.width, 24, 86, 58);
  const horizontalMargin = width === "auto" ? 5 : width / 2 + 2;
  return {
    size: ["small", "medium", "large"].includes(value?.size) ? value.size : "medium",
    x: clamp(value?.x, horizontalMargin, 100 - horizontalMargin, 50),
    y: clamp(value?.y, 14, 90, legacyY || 80),
    width,
  };
}

async function loadReadnoteSubtitleStyle() {
  try {
    const stored = await chrome.storage.local.get(SUBTITLE_STYLE_STORAGE_KEY);
    readnoteSubtitleStyle = normalizeReadnoteSubtitleStyle(stored[SUBTITLE_STYLE_STORAGE_KEY]);
    applyReadnoteSubtitleStyle();
  } catch (_error) {
    applyReadnoteSubtitleStyle();
  }
}

function applyReadnoteSubtitleStyle() {
  if (!readnoteSubtitleRoot) return;
  readnoteSubtitleRoot.dataset.size = readnoteSubtitleStyle.size;
  readnoteSubtitleRoot.style.setProperty("--rn-subtitle-x", `${readnoteSubtitleStyle.x}%`);
  readnoteSubtitleRoot.style.setProperty("--rn-subtitle-y", `${readnoteSubtitleStyle.y}%`);
  if (readnoteSubtitleStyle.width === "auto") {
    readnoteSubtitleRoot.style.removeProperty("--rn-subtitle-width");
  } else {
    readnoteSubtitleRoot.style.setProperty("--rn-subtitle-width", `${readnoteSubtitleStyle.width}%`);
  }
}

function updateReadnoteSubtitleStyle(action) {
  const sizes = ["small", "medium", "large"];
  if (action === "smaller") {
    readnoteSubtitleStyle.size = sizes[Math.max(0, sizes.indexOf(readnoteSubtitleStyle.size) - 1)];
  } else if (action === "larger") {
    readnoteSubtitleStyle.size = sizes[Math.min(sizes.length - 1, sizes.indexOf(readnoteSubtitleStyle.size) + 1)];
  }
  applyReadnoteSubtitleStyle();
  void chrome.storage.local.set({ [SUBTITLE_STYLE_STORAGE_KEY]: readnoteSubtitleStyle });
}

function setupReadnoteBackgroundCaptionSync(video) {
  readnoteBackgroundCaptionVideo = video;
  video.addEventListener("play", syncReadnoteBackgroundCaption);
  video.addEventListener("pause", syncReadnoteBackgroundCaption);
  video.addEventListener("timeupdate", syncReadnoteBackgroundCaption);
  if (!readnoteBackgroundCaptionVisibilityListenerAdded) {
    document.addEventListener("visibilitychange", syncReadnoteBackgroundCaption);
    readnoteBackgroundCaptionVisibilityListenerAdded = true;
  }
  void chrome.storage.local.get(BACKGROUND_CAPTION_LAYOUT_STORAGE_KEY).then((stored) => {
    readnoteBackgroundCaptionLayout = stored[BACKGROUND_CAPTION_LAYOUT_STORAGE_KEY] === "B" ? "B" : "A";
    updateReadnoteBackgroundCaptionControls();
    syncReadnoteBackgroundCaption();
  }).catch(() => {});
}

function updateReadnoteBackgroundCaptionControls() {
  readnoteSubtitleRoot?.querySelectorAll("[data-background-layout]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.backgroundLayout === readnoteBackgroundCaptionLayout));
  });
}

function renderReadnoteBackgroundCaptionWindow() {
  const captionWindow = readnoteBackgroundCaptionWindow;
  const video = readnoteBackgroundCaptionVideo;
  const surface = captionWindow?.document.querySelector(".rn-background-caption");
  if (!captionWindow || captionWindow.closed || !video || !surface) return;
  const show = document.visibilityState === "hidden" && !video.paused && !video.ended && readnoteSubtitleMode === "bilingual";
  surface.hidden = !show;
  surface.dataset.layout = readnoteBackgroundCaptionLayout;
  surface.querySelectorAll("[data-layout]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.layout === readnoteBackgroundCaptionLayout));
  });
  if (!show) return;
  const segment = ReadnoteTranscript.activeSegment(readnoteSubtitleSegments, video.currentTime);
  surface.querySelector(".rn-background-caption-en").textContent = segment?.text || "";
  surface.querySelector(".rn-background-caption-zh").textContent = segment?.translation || segment?.partialTranslation || (segment ? "Generating Chinese…" : "");
}

function syncReadnoteBackgroundCaption() {
  if (readnoteBackgroundCaptionWindow && !readnoteBackgroundCaptionWindow.closed) {
    renderReadnoteBackgroundCaptionWindow();
  }
}

function injectReadnoteBackgroundCaptionWindow(captionWindow) {
  const style = captionWindow.document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; } * { box-sizing: border-box; }
    body { margin: 0; min-width: 280px; min-height: 100vh; overflow: hidden; background: transparent; color: #f5f7fa; font: 14px/1.35 Inter,system-ui,sans-serif; }
    .rn-background-caption { position: relative; display: flex; min-height: 100vh; padding: 12px 14px; border: 1px solid rgba(255,255,255,.16); border-radius: 10px; background: rgba(7,10,13,.3); backdrop-filter: blur(4px); }
    .rn-background-caption[data-layout="A"] { align-items: flex-end; justify-content: flex-end; text-align: right; }
    .rn-background-caption[data-layout="B"] { align-items: center; justify-content: center; text-align: center; }
    .rn-background-caption-copy { width: 100%; max-width: 100%; }
    .rn-background-caption-line { display: block; overflow-wrap: anywhere; text-shadow: 0 2px 12px rgba(0,0,0,.92), 0 1px 3px rgba(0,0,0,.96); }
    .rn-background-caption-en { color: #fff; font-size: clamp(15px,4.5vw,22px); line-height: 1.22; }
    .rn-background-caption-zh { margin-top: 3px; color: #fff7dc; font-size: clamp(14px,4.2vw,21px); line-height: 1.26; font-weight: 550; }
    .rn-background-caption-tools { position: absolute; top: 5px; right: 7px; display: flex; gap: 3px; opacity: 0; transition: opacity .16s ease; }
    .rn-background-caption:hover .rn-background-caption-tools, .rn-background-caption:focus-within .rn-background-caption-tools { opacity: 1; }
    .rn-background-caption-tools button { width: 24px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,.22); border-radius: 5px; background: rgba(15,15,16,.58); color: rgba(255,255,255,.8); cursor: pointer; font: 600 10px/1 Inter,system-ui,sans-serif; }
    .rn-background-caption-tools button[aria-pressed="true"] { background: #0969da; color: #fff; }
  `;
  captionWindow.document.head.appendChild(style);
  captionWindow.document.body.innerHTML = `
    <main class="rn-background-caption" data-layout="${readnoteBackgroundCaptionLayout}">
      <div class="rn-background-caption-copy"><div class="rn-background-caption-line rn-background-caption-en"></div><div class="rn-background-caption-line rn-background-caption-zh"></div></div>
      <div class="rn-background-caption-tools" aria-label="Caption layout"><button type="button" data-layout="A" aria-label="Bottom-right layout">A</button><button type="button" data-layout="B" aria-label="Centered layout">B</button></div>
    </main>`;
  captionWindow.document.querySelectorAll("[data-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      readnoteBackgroundCaptionLayout = button.dataset.layout === "B" ? "B" : "A";
      void chrome.storage.local.set({ [BACKGROUND_CAPTION_LAYOUT_STORAGE_KEY]: readnoteBackgroundCaptionLayout });
      renderReadnoteBackgroundCaptionWindow();
    });
  });
}

async function openReadnoteBackgroundCaptions() {
  const video = readnoteBackgroundCaptionVideo || readnoteSubtitleVideo;
  if (!video || video.paused || video.ended) return;
  const pictureInPicture = window.documentPictureInPicture;
  if (!pictureInPicture || typeof pictureInPicture.requestWindow !== "function") return;
  if (readnoteBackgroundCaptionWindow && !readnoteBackgroundCaptionWindow.closed) {
    readnoteBackgroundCaptionWindow.focus();
    return;
  }
  try {
    const size = readnoteBackgroundCaptionLayout === "B" ? { width: 460, height: 130 } : { width: 340, height: 140 };
    const captionWindow = await pictureInPicture.requestWindow(size);
    readnoteBackgroundCaptionWindow = captionWindow;
    captionWindow.addEventListener("pagehide", () => {
      if (readnoteBackgroundCaptionWindow === captionWindow) readnoteBackgroundCaptionWindow = null;
    }, { once: true });
    injectReadnoteBackgroundCaptionWindow(captionWindow);
    renderReadnoteBackgroundCaptionWindow();
  } catch (_error) {
    // Unsupported or cancelled floating windows stay silent.
  }
}

function setupReadnoteSubtitleTransform(copy, player) {
  let interaction = null;
  const finish = (event) => {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    copy.classList.remove("is-dragging");
    copy.style.willChange = "";
    if (copy.hasPointerCapture?.(event.pointerId)) copy.releasePointerCapture(event.pointerId);
    interaction = null;
    void chrome.storage.local.set({ [SUBTITLE_STYLE_STORAGE_KEY]: readnoteSubtitleStyle });
  };

  copy.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".rn-subtitle-controls") && !event.target.closest("[data-resize-handle]")) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = player.getBoundingClientRect();
    const copyBounds = copy.getBoundingClientRect();
    interaction = {
      pointerId: event.pointerId,
      kind: event.target.closest("[data-resize-handle]") ? "resize" : "move",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: readnoteSubtitleStyle.x,
      startY: readnoteSubtitleStyle.y,
      startRenderedWidthPercent: (copyBounds.width / Math.max(1, bounds.width)) * 100,
      startLeftPercent: ((copyBounds.left - bounds.left) / Math.max(1, bounds.width)) * 100,
      playerLeft: bounds.left,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    };
    copy.classList.add("is-dragging");
    copy.style.willChange = "left, top, width, transform";
    copy.setPointerCapture?.(event.pointerId);
  });
  copy.addEventListener("pointermove", (event) => {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    event.preventDefault();
    if (interaction.kind === "move") {
      const horizontalMargin = interaction.startRenderedWidthPercent / 2 + 2;
      readnoteSubtitleStyle.x = Math.min(
        100 - horizontalMargin,
        Math.max(horizontalMargin, interaction.startX + ((event.clientX - interaction.startClientX) / interaction.width) * 100),
      );
      readnoteSubtitleStyle.y = Math.min(
        90,
        Math.max(14, interaction.startY + ((event.clientY - interaction.startClientY) / interaction.height) * 100),
      );
    } else {
      const pointerPercent = ((event.clientX - interaction.playerLeft) / interaction.width) * 100;
      const maximumWidth = Math.max(24, Math.min(86, 98 - interaction.startLeftPercent));
      readnoteSubtitleStyle.width = Math.min(
        maximumWidth,
        Math.max(24, pointerPercent - interaction.startLeftPercent),
      );
      readnoteSubtitleStyle.x = interaction.startLeftPercent + readnoteSubtitleStyle.width / 2;
    }
    applyReadnoteSubtitleStyle();
  });
  copy.addEventListener("pointerup", finish);
  copy.addEventListener("pointercancel", finish);
}

function updateReadnoteSubtitleControls() {
  if (!readnoteSubtitleRoot) return;
  readnoteSubtitleRoot.dataset.mode = readnoteSubtitleMode;
  readnoteSubtitleRoot.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === readnoteSubtitleMode));
  });
}

async function refreshReadnoteSubtitleState() {
  const videoId = currentReadnoteVideoId();
  if (!videoId || !readnoteSubtitleRoot) return;
  try {
    const result = await chrome.runtime.sendMessage({ action: "getOverlayState", videoId });
    if (result?.mode) readnoteSubtitleMode = result.mode;
    if (result?.success && Array.isArray(result.segments)) {
      readnoteSubtitleSegments = result.segments;
      const current = ReadnoteTranscript.activeSegment(
        readnoteSubtitleSegments,
        readnoteSubtitleVideo?.currentTime || 0,
      );
      const currentIndex = readnoteSubtitleSegments.findIndex((item) => item.id === current?.id);
      if (readnoteSubtitleMode === "bilingual" && currentIndex >= 0) {
        requestReadnoteActiveTranslation(currentIndex);
        scheduleReadnoteSubtitlePrefetch(currentIndex, 0);
      }
    }
    updateReadnoteSubtitleControls();
    renderReadnoteSubtitle();
    clearTimeout(readnoteSubtitleRefreshTimer);
    readnoteSubtitleRefreshTimer = setTimeout(
      refreshReadnoteSubtitleState,
      result?.success ? 60_000 : 10_000,
    );
  } catch (_error) {
    clearTimeout(readnoteSubtitleRefreshTimer);
    readnoteSubtitleRefreshTimer = setTimeout(refreshReadnoteSubtitleState, 10_000);
  }
}

function requestReadnoteActiveTranslation(startIndex) {
  if (readnoteSubtitleMode !== "bilingual" || readnoteSubtitleTranslationError) return;
  const segment = readnoteSubtitleSegments[startIndex];
  if (!segment?.id || segment.translation || readnoteSubtitleUrgentRequests.has(segment.id)) return;
  readnoteSubtitleUrgentRequests.add(segment.id);
  readnoteSubtitleTranslationRequests.add(segment.id);
  void requestReadnoteSubtitleBatch(
    [segment],
    "urgent",
    readnoteSubtitleTranslationGeneration,
    startIndex,
  );
}

function scheduleReadnoteSubtitlePrefetch(
  startIndex,
  delay = SUBTITLE_PREFETCH_DELAY_MS,
) {
  if (readnoteSubtitleMode !== "bilingual") return;
  clearTimeout(readnoteSubtitlePrefetchTimer);
  const generation = readnoteSubtitleTranslationGeneration;
  readnoteSubtitlePrefetchTimer = setTimeout(() => {
    readnoteSubtitlePrefetchTimer = null;
    dispatchReadnoteSubtitlePrefetch(startIndex, generation);
  }, delay);
}

function dispatchReadnoteSubtitlePrefetch(startIndex, generation) {
  if (
    generation !== readnoteSubtitleTranslationGeneration ||
    readnoteSubtitleMode !== "bilingual"
  ) return;
  const inflight = readnoteSubtitlePrefetchInflight.get(generation) || 0;
  const available = MAX_SUBTITLE_PREFETCH_REQUESTS - inflight;
  if (available <= 0) return;
  const plan = ReadnoteTranscript.planTranslationWindow(
    readnoteSubtitleSegments,
    startIndex,
    readnoteSubtitleTranslationRequests,
    {
      windowSize: SUBTITLE_PREFETCH_WINDOW,
      windowSeconds: SUBTITLE_PREFETCH_SECONDS,
      batchSize: SUBTITLE_PREFETCH_BATCH_SIZE,
      batchCount: available,
    },
  );
  plan.batches.forEach((batch) => {
    batch.forEach((segment) => readnoteSubtitleTranslationRequests.add(segment.id));
    readnoteSubtitlePrefetchInflight.set(
      generation,
      (readnoteSubtitlePrefetchInflight.get(generation) || 0) + 1,
    );
    void requestReadnoteSubtitleBatch(batch, "prefetch", generation, startIndex);
  });
}

async function requestReadnoteSubtitleBatch(candidates, lane, generation, startIndex) {
  const videoId = currentReadnoteVideoId();
  if (!videoId) return;
  let completed = false;
  try {
    const result = await chrome.runtime.sendMessage({
      action: "translateOverlayBatch",
      videoId,
      generation,
      segmentIds: candidates.map((segment) => segment.id),
    });
    if (result?.success && Array.isArray(result.translations)) {
      readnoteSubtitleTranslationError = "";
      const translated = new Map(
        result.translations.map((item) => [item.segmentId, item.translation]),
      );
      candidates.forEach((segment) => {
        if (translated.get(segment.id)) {
          segment.translation = translated.get(segment.id);
          segment.partialTranslation = "";
        }
      });
      const missing = candidates.filter((segment) => !segment.translation);
      if (missing.length) {
        setTimeout(
          () => missing.forEach((segment) => readnoteSubtitleTranslationRequests.delete(segment.id)),
          10_000,
        );
      }
      completed = true;
      renderReadnoteSubtitle();
    } else if (lane === "urgent" && readnoteSubtitleActiveId === candidates[0]?.id) {
      showReadnoteSubtitleTranslationError(result?.error, candidates);
    } else if (lane === "urgent") {
      candidates.forEach((segment) => readnoteSubtitleTranslationRequests.delete(segment.id));
    } else {
      retryReadnoteSubtitlePrefetch(candidates, startIndex, generation);
    }
  } catch (error) {
    if (lane === "urgent" && readnoteSubtitleActiveId === candidates[0]?.id) {
      showReadnoteSubtitleTranslationError(error?.message, candidates);
    } else if (lane === "urgent") {
      candidates.forEach((segment) => readnoteSubtitleTranslationRequests.delete(segment.id));
    } else {
      retryReadnoteSubtitlePrefetch(candidates, startIndex, generation);
    }
  } finally {
    if (lane === "urgent") {
      candidates.forEach((segment) => readnoteSubtitleUrgentRequests.delete(segment.id));
    } else {
      const remaining = Math.max(
        0,
        (readnoteSubtitlePrefetchInflight.get(generation) || 1) - 1,
      );
      if (remaining) readnoteSubtitlePrefetchInflight.set(generation, remaining);
      else readnoteSubtitlePrefetchInflight.delete(generation);
    }
    if (completed) {
      candidates.forEach((segment) => readnoteSubtitleTranslationRequests.delete(segment.id));
    }
    if (generation === readnoteSubtitleTranslationGeneration) {
      const activeIndex = readnoteSubtitleSegments.findIndex(
        (segment) => segment.id === readnoteSubtitleActiveId,
      );
      if (activeIndex >= 0) {
        requestReadnoteActiveTranslation(activeIndex);
        scheduleReadnoteSubtitlePrefetch(activeIndex, completed ? 0 : 1_500);
      }
    }
  }
}

function retryReadnoteSubtitlePrefetch(candidates, startIndex, generation) {
  setTimeout(() => {
    candidates.forEach((segment) => readnoteSubtitleTranslationRequests.delete(segment.id));
    if (generation === readnoteSubtitleTranslationGeneration) {
      scheduleReadnoteSubtitlePrefetch(startIndex, 0);
    }
  }, 5_000);
}

function showReadnoteSubtitleTranslationError(error, candidates) {
  readnoteSubtitleTranslationError = subtitleTranslationErrorMessage(error);
  renderReadnoteSubtitle();
  setTimeout(() => {
    candidates.forEach((segment) =>
      readnoteSubtitleTranslationRequests.delete(segment.id),
    );
    readnoteSubtitleTranslationError = "";
    renderReadnoteSubtitle();
    const activeIndex = readnoteSubtitleSegments.findIndex(
      (segment) => segment.id === readnoteSubtitleActiveId,
    );
    if (activeIndex >= 0) {
      requestReadnoteActiveTranslation(activeIndex);
      scheduleReadnoteSubtitlePrefetch(activeIndex, 0);
    }
  }, 10_000);
}

function subtitleTranslationErrorMessage(error) {
  const message = String(error || "");
  if (/API key not configured/i.test(message)) return "Add an AI provider key in Readnote Atlas Settings";
  if (/rate limit/i.test(message)) return "Translation is busy and will retry shortly";
  return "Translation is temporarily unavailable and will retry shortly";
}

function renderReadnoteSubtitle(forcePriorityRefresh = false) {
  if (!readnoteSubtitleRoot || !readnoteSubtitleVideo) return;
  const original = readnoteSubtitleRoot.querySelector(".rn-subtitle-original");
  const chinese = readnoteSubtitleRoot.querySelector(".rn-subtitle-zh");
  if (readnoteSubtitleMode === "off") {
    readnoteSubtitleActiveId = "";
    original.textContent = "";
    chinese.textContent = "";
    syncReadnoteBackgroundCaption();
    return;
  }

  const segment = ReadnoteTranscript.activeSegment(
    readnoteSubtitleSegments,
    readnoteSubtitleVideo.currentTime,
  );
  if (!segment) {
    readnoteSubtitleActiveId = "";
    original.textContent = "";
    chinese.textContent = "";
    syncReadnoteBackgroundCaption();
    return;
  }

  const activeChanged = readnoteSubtitleActiveId !== segment.id;
  readnoteSubtitleActiveId = segment.id;
  original.textContent = ReadnoteTranscript.wrapSubtitle(segment.text);
  chinese.hidden = false;
  chinese.textContent = ReadnoteTranscript.wrapSubtitle(
    segment.translation ||
      segment.partialTranslation ||
      readnoteSubtitleTranslationError ||
      "Generating Chinese…",
  );
  chinese.classList.toggle("is-pending", !segment.translation);
  if (activeChanged || forcePriorityRefresh) {
    const activeIndex = Math.max(
      0,
      readnoteSubtitleSegments.findIndex((item) => item.id === segment.id),
    );
    requestReadnoteActiveTranslation(activeIndex);
    scheduleReadnoteSubtitlePrefetch(activeIndex);
  }
  syncReadnoteBackgroundCaption();
}

function cleanupReadnoteSubtitles() {
  if (readnoteBackgroundCaptionVideo) {
    readnoteBackgroundCaptionVideo.removeEventListener("play", syncReadnoteBackgroundCaption);
    readnoteBackgroundCaptionVideo.removeEventListener("pause", syncReadnoteBackgroundCaption);
    readnoteBackgroundCaptionVideo.removeEventListener("timeupdate", syncReadnoteBackgroundCaption);
    readnoteBackgroundCaptionVideo = null;
  }
  if (readnoteBackgroundCaptionWindow && !readnoteBackgroundCaptionWindow.closed) {
    readnoteBackgroundCaptionWindow.close();
  }
  readnoteBackgroundCaptionWindow = null;
  if (readnoteSubtitleVideo && readnoteSubtitleTimeListener) {
    readnoteSubtitleVideo.removeEventListener("timeupdate", readnoteSubtitleTimeListener);
  }
  if (readnoteSubtitleVideo && readnoteSubtitleSeekListener) {
    readnoteSubtitleVideo.removeEventListener("seeking", readnoteSubtitleSeekListener);
  }
  clearInterval(readnoteSubtitleRefreshTimer);
  clearInterval(readnoteSubtitleRetryTimer);
  clearTimeout(readnoteSubtitlePrefetchTimer);
  readnoteSubtitleRefreshTimer = null;
  readnoteSubtitleRetryTimer = null;
  readnoteSubtitlePrefetchTimer = null;
  readnoteSubtitleRoot?.remove();
  document.getElementById("readnote-subtitle-style")?.remove();
  readnoteSubtitleRoot = null;
  readnoteSubtitleSegments = [];
  readnoteSubtitleVideo = null;
  readnoteSubtitleTimeListener = null;
  readnoteSubtitleSeekListener = null;
  readnoteSubtitleActiveId = "";
  readnoteSubtitleTranslationError = "";
  readnoteSubtitleTranslationGeneration += 1;
  readnoteSubtitleUrgentRequests.clear();
  readnoteSubtitlePrefetchInflight.clear();
  readnoteSubtitleTranslationRequests.clear();
}

// ============================================================
// NOTE BUTTON (Overlay on Video Player)
// ============================================================

/**
 * Injects a "Note" button overlay on top of the YouTube video player.
 * The button appears when the mouse enters or moves over the player and hides
 * after the cursor stays still for more than 2 seconds or leaves the player.
 */
function injectNoteButton() {
  // Don't inject if we're not on a video page
  if (!window.location.pathname.includes("/watch")) return;

  // Don't inject if button already exists and is properly tracked.
  // If a stale button exists (e.g., from a previous content-script instance),
  // remove it and re-inject so event listeners are attached to the live one.
  const existingButton = document.getElementById("ytd-note-button");
  if (existingButton) {
    if (ytdNoteButton === existingButton && existingButton.isConnected) {
      return; // already injected and connected
    }
    existingButton.remove();
  }

  // Find the video player container. YouTube rebuilds this dynamically, so
  // we try the most common selectors.
  const playerContainer = document.querySelector(
    "#movie_player.html5-video-player, " +
      "#movie_player, " +
      ".html5-video-player",
  );

  if (!playerContainer) {
    debugLog(
      "[Readnote Atlas Content] Player container not found yet, will retry",
    );
    return;
  }

  // Ensure the player container has relative positioning for absolute children
  if (
    window.getComputedStyle(playerContainer).position === "static" ||
    !playerContainer.style.position
  ) {
    playerContainer.style.position = "relative";
  }

  debugLog("[Readnote Atlas Content] Injecting note button");

  // A compact bookmark marks the exact moment without competing with video.
  const noteButton = document.createElement("button");
  noteButton.id = "ytd-note-button";
  noteButton.type = "button";
  noteButton.setAttribute("aria-label", "Bookmark this moment");
  noteButton.title = "Bookmark this moment (N)";
  noteButton.innerHTML = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z"></path>
    </svg>
  `;

  // Compact Readnote-blue action with a restrained shadow.
  // Start hidden; visibility is controlled by mouse activity.
  noteButton.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    background: rgba(15, 15, 16, 0.72);
    color: white;
    border: 1px solid rgba(255,255,255,0.24);
    border-radius: 9px;
    font-family: system-ui, -apple-system, "Roboto", sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    cursor: pointer;
    transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
    opacity: 0;
    pointer-events: none;
    box-shadow: 0 3px 12px rgba(0,0,0,0.24);
    backdrop-filter: blur(12px);
  `;

  ytdNoteButton = noteButton;

  // Show button when mouse enters or moves over the player.
  // Hide after 2 seconds of idle or when the mouse leaves.
  playerContainer.addEventListener("mouseenter", () => {
    showNoteButton();
    resetNoteButtonTimer();
  });

  playerContainer.addEventListener("mousemove", () => {
    showNoteButton();
    resetNoteButtonTimer();
  });

  playerContainer.addEventListener("mouseleave", () => {
    clearTimeout(ytdNoteButtonTimer);
    ytdNoteButtonTimer = null;
    hideNoteButton();
  });

  // Hover effect — lift slightly
  noteButton.addEventListener("mouseenter", () => {
    noteButton.style.background = "#0969da";
    noteButton.style.boxShadow = "0 5px 16px rgba(0,0,0,0.3)";
    noteButton.style.transform = "translateY(-1px)";
  });

  noteButton.addEventListener("mouseleave", () => {
    noteButton.style.background = "rgba(15, 15, 16, 0.72)";
    noteButton.style.boxShadow = "0 3px 12px rgba(0,0,0,0.24)";
    noteButton.style.transform = "translateY(0)";
  });

  // Click handler — save the current moment as a note
  noteButton.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await saveCurrentNote();
  });

  playerContainer.appendChild(noteButton);

  debugLog("[Readnote Atlas Content] Note button injected");
}

function showNoteButton() {
  if (!ytdNoteButton) return;
  ytdNoteButton.style.opacity = "1";
  ytdNoteButton.style.pointerEvents = "auto";
}

function hideNoteButton() {
  if (!ytdNoteButton) return;
  ytdNoteButton.style.opacity = "0";
  ytdNoteButton.style.pointerEvents = "none";
}

function resetNoteButtonTimer() {
  clearTimeout(ytdNoteButtonTimer);
  ytdNoteButtonTimer = setTimeout(() => {
    hideNoteButton();
  }, 2000);
}

/**
 * Handles the "n" keyboard shortcut for saving a note.
 * Only triggers on YouTube watch pages and when the user is not typing
 * in an input field.
 */
function handleNoteKeyboardShortcut(e) {
  if (!window.location.pathname.includes("/watch")) return;
  if (e.key !== "n" && e.key !== "N") return;

  // Ignore if the user is typing in an input/textarea/contenteditable
  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
    return;
  }

  // Prevent YouTube's own "n" shortcut (e.g. next video in playlist)
  e.preventDefault();
  e.stopPropagation();

  // Show brief visual feedback on the button, then save
  showNoteButton();
  resetNoteButtonTimer();
  saveCurrentNote();
}

/**
 * Captures the current timestamp and saves it as a note.
 */
async function saveCurrentNote() {
  debugLog("[Readnote Atlas] Saving note");

  const video = document.querySelector("video.html5-main-video");
  if (!video) {
    debugLog("[Readnote Atlas] No video element found");
    return;
  }

  // Go back 3 seconds to capture what was just said (user reacts after hearing it)
  const currentTime = Math.max(0, Math.floor(video.currentTime) - 3);
  const videoInfo = extractVideoInfo();
  const videoId = new URLSearchParams(window.location.search).get("v");

  const noteButton = ytdNoteButton;
  const originalContent = noteButton ? noteButton.innerHTML : "";

  if (noteButton) {
    noteButton.innerHTML = '<span aria-hidden="true" style="font-size:16px;line-height:1">…</span>';
    noteButton.style.pointerEvents = "none";
  }

  try {
    const result = await chrome.runtime.sendMessage({
      action: "saveNote",
      videoId: videoId,
      timestamp: currentTime,
      videoTitle: videoInfo.title,
      channelName: videoInfo.channelName,
    });

    if (result.success) {
      if (noteButton) {
        noteButton.innerHTML =
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z"></path></svg>';
        noteButton.style.background = "#1a7f37";
      }
      showNoteSavedToast(result.note);
    } else {
      if (noteButton) {
        noteButton.innerHTML = '<span aria-hidden="true" style="font-weight:700">!</span>';
      }
      debugLog("[Readnote Atlas] Save note unavailable:", result.error);
    }
  } catch (err) {
    if (noteButton) {
      noteButton.innerHTML = '<span aria-hidden="true" style="font-weight:700">!</span>';
    }
    debugLog("[Readnote Atlas] Save note unavailable:", err);
  }

  setTimeout(() => {
    if (noteButton) {
      noteButton.innerHTML = originalContent;
      noteButton.style.background = "rgba(15, 15, 16, 0.72)";
      noteButton.style.pointerEvents = "auto";
    }
  }, 2000);
}

/**
 * Shows a toast notification when a note is saved.
 */
function showNoteSavedToast(note) {
  // Remove existing toast
  const existing = document.getElementById("ytd-note-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "ytd-note-toast";
  toast.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 6px; color: #0969da;">Bookmark saved</div>
    <div style="font-size: 12px; color: #57606a; margin-bottom: 8px;">${escapeHtmlForContent(note.timestamp)} — ${escapeHtmlForContent(note.videoTitle)}</div>
    <div style="font-size: 13px; line-height: 1.55; color: #24292f;">"${escapeHtmlForContent(note.text)}"</div>
    <div style="margin-top: 10px; font-size: 11px;">
      <a href="${escapeHtmlForContent(note.timestampedUrl)}" style="color: #0969da; font-weight: 600; text-decoration: none;">Copy link</a>
    </div>
  `;

  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    background: #ffffff;
    border: 1px solid #ece5d9;
    border-radius: 14px;
    padding: 16px 20px;
    max-width: 350px;
    box-shadow: 0 12px 32px rgba(50, 42, 32, 0.2);
    font-family: system-ui, -apple-system, "Roboto", sans-serif;
    animation: ytdSlideIn 0.3s ease;
  `;

  // Add animation keyframes
  const style = document.createElement("style");
  style.textContent = `
    @keyframes ytdSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  // Copy link handler
  toast.querySelector("a").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(note.timestampedUrl);
      e.target.textContent = "Copied";
    } catch (err) {
      debugLog("Copy unavailable:", err);
    }
  });

  document.body.appendChild(toast);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    toast.style.animation = "ytdSlideIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ============================================================
// VIDEO INFO EXTRACTION
// ============================================================

/**
 * Reads the video title, channel name, and description directly from YouTube's page.
 * These are just sitting in the HTML — we grab them from the DOM elements.
 */
function extractVideoInfo() {
  // The video title is in an h1 element inside the #title container
  const titleElement = document.querySelector(
    "h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string",
  );

  // The channel name is in the channel info section
  const channelElement = document.querySelector(
    "#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string a",
  );

  // Video duration from the video element
  const videoElement = document.querySelector("video.html5-main-video");

  // Video description — YouTube has this in a few possible places
  const descriptionElement = document.querySelector(
    "#description-inner, " +
      "ytd-watch-metadata #description yt-attributed-string, " +
      "#description yt-formatted-string, " +
      "ytd-expander#description yt-attributed-string",
  );

  return {
    title: titleElement?.textContent?.trim() || "",
    channelName: channelElement?.textContent?.trim() || "",
    duration: videoElement?.duration || 0,
    description: descriptionElement?.textContent?.trim() || "",
  };
}

// ============================================================
// SEEK TO TIMESTAMP
// ============================================================

/**
 * Jumps the YouTube video to a specific timestamp (in seconds).
 * This is called when the user clicks a timestamp in the side panel.
 *
 * We simply set the video element's .currentTime property,
 * which is the standard HTML5 way to seek in a video.
 */
function seekToTimestamp(seconds) {
  const video = document.querySelector("video.html5-main-video");
  if (!video) {
    debugLog("[Readnote Atlas Content] No video element found for seek");
    return;
  }

  debugLog("[Readnote Atlas Content] Seeking to:", seconds);
  video.currentTime = seconds;
  // Also play the video if it's paused
  if (video.paused) {
    video.play().catch(() => {}); // Ignore autoplay errors
  }
}

function escapeHtmlForContent(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

// ============================================================
// WATCHED VIDEO LIBRARY
// ============================================================

function currentWatchHistoryMetadata(videoId, video) {
  const info = extractVideoInfo();
  return {
    videoId,
    title: info.title,
    channelName: info.channelName,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    duration: Number(video?.duration) || Number(info.duration) || 0,
    lastPosition: Number(video?.currentTime) || 0,
  };
}

function watchHistoryTick() {
  const tracker = watchHistoryTracker;
  if (!tracker) return;
  const now = performance.now();
  const elapsed = Math.min(2, Math.max(0, (now - tracker.lastTick) / 1000));
  tracker.lastTick = now;
  if (
    document.visibilityState === "visible" &&
    !tracker.video.paused &&
    !tracker.video.ended &&
    tracker.video.readyState >= 2
  ) {
    tracker.pendingSeconds += elapsed;
  }
  if (tracker.pendingSeconds >= WATCH_HISTORY_FLUSH_SECONDS) {
    void flushWatchHistoryProgress();
  }
}

async function flushWatchHistoryProgress() {
  const tracker = watchHistoryTracker;
  if (!tracker || tracker.pendingSeconds < 0.25) return;
  const watchedSeconds = tracker.pendingSeconds;
  tracker.pendingSeconds = 0;
  const trackerVideoId = tracker.videoId;
  try {
    const result = await chrome.runtime.sendMessage({
      action: "recordWatchProgress",
      video: {
        ...tracker.metadata,
        duration: Number(tracker.video.duration) || tracker.metadata.duration,
        lastPosition: Number(tracker.video.currentTime) || 0,
      },
      watchedSeconds,
    });
    if (!result?.success) throw new Error(result?.error || "Watch progress was not saved");
  } catch (_error) {
    if (watchHistoryTracker?.videoId === trackerVideoId) {
      watchHistoryTracker.pendingSeconds += watchedSeconds;
    }
  }
}

function setupWatchHistoryTracking() {
  setupWatchHistoryPageListeners();
  const videoId = currentReadnoteVideoId();
  const video = document.querySelector("video.html5-main-video");
  if (!videoId || !video) return;
  if (
    watchHistoryTracker?.videoId === videoId &&
    watchHistoryTracker.video === video
  ) {
    const latest = currentWatchHistoryMetadata(videoId, video);
    if (latest.title) watchHistoryTracker.metadata.title = latest.title;
    if (latest.channelName) {
      watchHistoryTracker.metadata.channelName = latest.channelName;
    }
    return;
  }
  void flushWatchHistoryProgress();
  watchHistoryTracker = {
    videoId,
    video,
    metadata: currentWatchHistoryMetadata(videoId, video),
    pendingSeconds: 0,
    lastTick: performance.now(),
  };
  clearInterval(watchHistoryTimer);
  watchHistoryTimer = setInterval(watchHistoryTick, 1000);
}

// ============================================================
// PAGE NAVIGATION DETECTION
// ============================================================

/**
 * YouTube is a "Single Page Application" (SPA). This means when you
 * click on a new video, the page doesn't fully reload — YouTube
 * dynamically swaps out the content. So our content script stays alive
 * but needs to detect when the video changes.
 *
 * We watch for URL changes using the `yt-navigate-finish` event,
 * which YouTube fires after navigation completes. When that happens,
 * we clean up old markers and re-inject the button.
 */
document.addEventListener("yt-navigate-finish", () => {
  void flushWatchHistoryProgress();
  cleanupReadnoteSubtitles();
  // Clean up old key moment markers when navigating to a new video
  const existingMarkers = document.querySelectorAll(".ytd-key-moment-markers");
  existingMarkers.forEach((m) => m.remove());

  // Remove old buttons (they will be re-injected for the new video)
  document
    .querySelectorAll("#ytd-digest-button")
    .forEach((button) => button.remove());
  ytdDigestButton = null;
  if (digestButtonReconcileTimer) {
    clearTimeout(digestButtonReconcileTimer);
    digestButtonReconcileTimer = null;
  }

  const existingNoteButton = document.getElementById("ytd-note-button");
  if (existingNoteButton) existingNoteButton.remove();

  // Reset note button state
  ytdNoteButton = null;
  clearTimeout(ytdNoteButtonTimer);
  ytdNoteButtonTimer = null;
  if (ytdNoteButtonRetryTimer) {
    clearInterval(ytdNoteButtonRetryTimer);
    ytdNoteButtonRetryTimer = null;
  }

  // Remove any toasts
  const existingToast = document.getElementById("ytd-note-toast");
  if (existingToast) existingToast.remove();

  // Re-inject buttons for the new video (with a small delay for YouTube to render)
  setTimeout(() => {
    scheduleDigestButtonReconciliation(0);
    tryInjectNoteButton();
    setupReadnoteSubtitles();
    setupWatchHistoryTracking();
  }, 500);
});
