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
let readnoteSubtitleRefreshTimer = null;
let readnoteSubtitleRetryTimer = null;
let readnoteSubtitleActiveId = "";
let readnoteSubtitleTranslationError = "";
const readnoteSubtitleTranslationRequests = new Set();
const SUBTITLE_PREFETCH_COUNT = 6;
const SUBTITLE_PREFETCH_WINDOW = 18;
const SUBTITLE_STYLE_STORAGE_KEY = "readnote_subtitle_style";
let readnoteSubtitleStyle = {
  font: "sans",
  size: "medium",
  x: 50,
  y: 78,
  scale: 1,
};

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

  // Also set up an observer to handle YouTube's dynamic content loading
  // (YouTube is an SPA, so elements appear/disappear as you navigate)
  setupButtonObserver();
  setupDigestButtonResizeListener();
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
        "[Readnote Studio Content] Player container not found after retries, giving up",
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
  debugLog("[Readnote Studio Content] Received message:", message.action, message);

  if (message.action === "getVideoInfo") {
    // Read video title and channel name from the page
    const info = extractVideoInfo();
    debugLog("[Readnote Studio Content] Returning video info:", info);
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

  if (message.action === "seekTo") {
    // Jump the video to a specific timestamp
    debugLog("[Readnote Studio Content] Seeking to:", message.seconds);
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

  // Unknown action - still send a response to prevent hanging
  debugLog("[Readnote Studio Content] Unknown action:", message.action);
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
 * When clicked, it opens the Readnote Studio side panel.
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
  digestButton.setAttribute("aria-label", "Open Readnote Studio");
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

    debugLog("[Readnote Studio] Digest button clicked");

    // Send message to background script to open side panel
    try {
      const result = await chrome.runtime.sendMessage({
        action: "openSidePanel",
      });
      debugLog("[Readnote Studio] openSidePanel response:", result);
    } catch (err) {
      console.error("[Readnote Studio] Failed to open side panel:", err);
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
    debugLog("[Readnote Studio Content] Visible actions container not found yet");
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

  debugLog("[Readnote Studio Content] Digest button reconciled");
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
    video.addEventListener("timeupdate", readnoteSubtitleTimeListener);
    video.addEventListener("seeking", readnoteSubtitleTimeListener);
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
    #readnote-subtitle-root { position:absolute; inset:0; z-index:48; pointer-events:none; font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif; }
    #readnote-subtitle-root .rn-subtitle-copy { position:absolute; left:var(--rn-subtitle-x,50%); top:var(--rn-subtitle-y,78%); width:min(88%,1100px); transform:translate(-50%,-50%) scale(var(--rn-subtitle-scale,1)); transform-origin:center; display:grid; gap:4px; justify-items:center; text-align:center; transition:opacity .16s ease; pointer-events:auto; cursor:grab; touch-action:none; user-select:none; }
    #readnote-subtitle-root .rn-subtitle-copy.is-dragging { cursor:grabbing; }
    #readnote-subtitle-root .rn-subtitle-line { width:max-content; max-width:100%; padding:3px 11px; border-radius:8px; background:rgba(7,7,8,.78); color:#fff; font-size:clamp(18px,2.05vw,29px); line-height:1.28; letter-spacing:.01em; text-align:center; white-space:pre-line; text-wrap:balance; text-shadow:0 2px 4px rgba(0,0,0,.82); box-decoration-break:clone; -webkit-box-decoration-break:clone; pointer-events:none; }
    #readnote-subtitle-root .rn-subtitle-line:empty { display:none; }
    #readnote-subtitle-root .rn-subtitle-zh { color:#fff7dc; font-weight:550; }
    #readnote-subtitle-root .rn-subtitle-zh.is-pending { color:rgba(255,247,220,.68); font-size:clamp(14px,1.3vw,18px); }
    #readnote-subtitle-root .rn-subtitle-controls { position:absolute; top:14px; left:14px; display:flex; padding:3px; gap:2px; border:1px solid rgba(255,255,255,.18); border-radius:999px; background:rgba(15,15,16,.74); opacity:0; pointer-events:auto; backdrop-filter:blur(14px); transition:opacity .18s ease; }
    #movie_player:hover #readnote-subtitle-root .rn-subtitle-controls, #readnote-subtitle-root .rn-subtitle-controls:focus-within { opacity:1; }
    #readnote-subtitle-root .rn-subtitle-settings { display:flex; gap:2px; align-items:center; }
    #readnote-subtitle-root .rn-subtitle-controls:not(.is-expanded) .rn-subtitle-settings { display:none; }
    #readnote-subtitle-root .rn-subtitle-controls-toggle { min-width:34px; padding:0 8px; color:white; }
    #readnote-subtitle-root .rn-subtitle-mode { min-width:45px; height:28px; padding:0 10px; border:0; border-radius:999px; background:transparent; color:rgba(255,255,255,.72); font:600 11px/1 Inter,system-ui,sans-serif; cursor:pointer; }
    #readnote-subtitle-root .rn-subtitle-mode[aria-pressed="true"] { background:#0969da; color:white; }
    #readnote-subtitle-root .rn-subtitle-divider { width:1px; height:18px; align-self:center; background:rgba(255,255,255,.18); }
    #readnote-subtitle-root[data-font="serif"] .rn-subtitle-line { font-family:Georgia,"Noto Serif SC",serif; }
    #readnote-subtitle-root[data-size="small"] .rn-subtitle-line { font-size:clamp(15px,1.65vw,24px); }
    #readnote-subtitle-root[data-size="large"] .rn-subtitle-line { font-size:clamp(21px,2.5vw,35px); }
    #readnote-subtitle-root .rn-subtitle-resize { position:absolute; right:-10px; bottom:-10px; width:20px; height:20px; border:0; border-radius:50%; background:#0969da; box-shadow:0 2px 8px rgba(0,0,0,.35); cursor:nwse-resize; opacity:0; transition:opacity .16s ease; pointer-events:auto; touch-action:none; }
    #readnote-subtitle-root .rn-subtitle-copy:hover .rn-subtitle-resize, #readnote-subtitle-root .rn-subtitle-copy.is-dragging .rn-subtitle-resize { opacity:1; }
    #readnote-subtitle-root .rn-subtitle-resize::after { content:""; position:absolute; inset:6px; border-right:2px solid white; border-bottom:2px solid white; }
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
      <button class="rn-subtitle-mode rn-subtitle-controls-toggle" type="button" data-controls-toggle aria-expanded="false" title="Subtitle settings">Aa</button>
      <div class="rn-subtitle-settings">
        <button class="rn-subtitle-mode" type="button" data-mode="bilingual">On</button>
        <button class="rn-subtitle-mode" type="button" data-mode="off">Off</button>
        <span class="rn-subtitle-divider" aria-hidden="true"></span>
        <button class="rn-subtitle-mode" type="button" data-style-action="font" title="Switch subtitle font">Font</button>
        <button class="rn-subtitle-mode" type="button" data-style-action="smaller" title="Smaller subtitles">A−</button>
        <button class="rn-subtitle-mode" type="button" data-style-action="larger" title="Larger subtitles">A+</button>
        <button class="rn-subtitle-mode" type="button" data-style-action="lower" title="Move subtitles down">↓</button>
        <button class="rn-subtitle-mode" type="button" data-style-action="higher" title="Move subtitles up">↑</button>
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
      setReadnoteSubtitleControlsExpanded(false);
    });
  });
  setupReadnoteSubtitleTransform(root.querySelector(".rn-subtitle-copy"), player);
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
  return {
    font: value?.font === "serif" ? "serif" : "sans",
    size: ["small", "medium", "large"].includes(value?.size) ? value.size : "medium",
    x: clamp(value?.x, 10, 90, 50),
    y: clamp(value?.y, 14, 90, legacyY || 78),
    scale: clamp(value?.scale, 0.65, 1.75, 1),
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
  readnoteSubtitleRoot.dataset.font = readnoteSubtitleStyle.font;
  readnoteSubtitleRoot.dataset.size = readnoteSubtitleStyle.size;
  readnoteSubtitleRoot.style.setProperty("--rn-subtitle-x", `${readnoteSubtitleStyle.x}%`);
  readnoteSubtitleRoot.style.setProperty("--rn-subtitle-y", `${readnoteSubtitleStyle.y}%`);
  readnoteSubtitleRoot.style.setProperty("--rn-subtitle-scale", String(readnoteSubtitleStyle.scale));
}

function updateReadnoteSubtitleStyle(action) {
  const sizes = ["small", "medium", "large"];
  if (action === "font") {
    readnoteSubtitleStyle.font = readnoteSubtitleStyle.font === "sans" ? "serif" : "sans";
  } else if (action === "smaller") {
    readnoteSubtitleStyle.size = sizes[Math.max(0, sizes.indexOf(readnoteSubtitleStyle.size) - 1)];
  } else if (action === "larger") {
    readnoteSubtitleStyle.size = sizes[Math.min(sizes.length - 1, sizes.indexOf(readnoteSubtitleStyle.size) + 1)];
  } else if (action === "lower") {
    readnoteSubtitleStyle.y = Math.min(90, readnoteSubtitleStyle.y + 4);
  } else if (action === "higher") {
    readnoteSubtitleStyle.y = Math.max(14, readnoteSubtitleStyle.y - 4);
  }
  applyReadnoteSubtitleStyle();
  void chrome.storage.local.set({ [SUBTITLE_STYLE_STORAGE_KEY]: readnoteSubtitleStyle });
}

function setupReadnoteSubtitleTransform(copy, player) {
  let interaction = null;
  const finish = (event) => {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    copy.classList.remove("is-dragging");
    if (copy.hasPointerCapture?.(event.pointerId)) copy.releasePointerCapture(event.pointerId);
    interaction = null;
    void chrome.storage.local.set({ [SUBTITLE_STYLE_STORAGE_KEY]: readnoteSubtitleStyle });
  };

  copy.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = player.getBoundingClientRect();
    interaction = {
      pointerId: event.pointerId,
      kind: event.target.closest("[data-resize-handle]") ? "resize" : "move",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: readnoteSubtitleStyle.x,
      startY: readnoteSubtitleStyle.y,
      startScale: readnoteSubtitleStyle.scale,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    };
    copy.classList.add("is-dragging");
    copy.setPointerCapture?.(event.pointerId);
  });
  copy.addEventListener("pointermove", (event) => {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    event.preventDefault();
    if (interaction.kind === "move") {
      readnoteSubtitleStyle.x = Math.min(
        90,
        Math.max(10, interaction.startX + ((event.clientX - interaction.startClientX) / interaction.width) * 100),
      );
      readnoteSubtitleStyle.y = Math.min(
        90,
        Math.max(14, interaction.startY + ((event.clientY - interaction.startClientY) / interaction.height) * 100),
      );
    } else {
      readnoteSubtitleStyle.scale = Math.min(
        1.75,
        Math.max(0.65, interaction.startScale + (event.clientX - interaction.startClientX) / Math.max(220, interaction.width * 0.45)),
      );
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
      const currentIndex = Math.max(0, readnoteSubtitleSegments.findIndex((item) => item.id === current?.id));
      if (readnoteSubtitleMode === "bilingual") {
        void requestReadnoteSubtitleTranslations(currentIndex);
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

async function requestReadnoteSubtitleTranslations(startIndex) {
  if (readnoteSubtitleMode !== "bilingual" || readnoteSubtitleTranslationError) return;
  const videoId = currentReadnoteVideoId();
  if (!videoId) return;
  const candidates = readnoteSubtitleSegments
    .slice(Math.max(0, startIndex), Math.max(0, startIndex) + SUBTITLE_PREFETCH_WINDOW)
    .filter((segment) =>
      segment?.id && !segment.translation && !readnoteSubtitleTranslationRequests.has(segment.id),
    )
    .slice(0, SUBTITLE_PREFETCH_COUNT);
  if (!candidates.length) return;
  candidates.forEach((segment) => readnoteSubtitleTranslationRequests.add(segment.id));
  try {
    const result = await chrome.runtime.sendMessage({
      action: "translateOverlayBatch",
      videoId,
      segmentIds: candidates.map((segment) => segment.id),
    });
    if (result?.success && Array.isArray(result.translations)) {
      readnoteSubtitleTranslationError = "";
      const translated = new Map(
        result.translations.map((item) => [item.segmentId, item.translation]),
      );
      candidates.forEach((segment) => {
        if (translated.get(segment.id)) segment.translation = translated.get(segment.id);
      });
      const missing = candidates.filter((segment) => !segment.translation);
      if (missing.length) {
        setTimeout(
          () => missing.forEach((segment) => readnoteSubtitleTranslationRequests.delete(segment.id)),
          10_000,
        );
      }
      renderReadnoteSubtitle();
    } else {
      showReadnoteSubtitleTranslationError(result?.error, candidates);
    }
  } catch (error) {
    showReadnoteSubtitleTranslationError(error?.message, candidates);
  }
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
  }, 10_000);
}

function subtitleTranslationErrorMessage(error) {
  const message = String(error || "");
  if (/API key not configured/i.test(message)) return "请在 Readnote 设置中配置 DeepSeek API Key";
  if (/rate limit/i.test(message)) return "翻译请求较多，稍后自动重试";
  return "翻译暂时失败，稍后自动重试";
}

function renderReadnoteSubtitle() {
  if (!readnoteSubtitleRoot || !readnoteSubtitleVideo) return;
  const original = readnoteSubtitleRoot.querySelector(".rn-subtitle-original");
  const chinese = readnoteSubtitleRoot.querySelector(".rn-subtitle-zh");
  if (readnoteSubtitleMode === "off") {
    readnoteSubtitleActiveId = "";
    original.textContent = "";
    chinese.textContent = "";
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
    return;
  }

  readnoteSubtitleActiveId = segment.id;
  original.textContent = ReadnoteTranscript.wrapSubtitle(segment.text);
  chinese.hidden = false;
  chinese.textContent = ReadnoteTranscript.wrapSubtitle(
    segment.translation || readnoteSubtitleTranslationError || "正在生成中文…",
  );
  chinese.classList.toggle("is-pending", !segment.translation);
  const activeIndex = readnoteSubtitleSegments.findIndex((item) => item.id === segment.id);
  void requestReadnoteSubtitleTranslations(Math.max(0, activeIndex));
}

function cleanupReadnoteSubtitles() {
  if (readnoteSubtitleVideo && readnoteSubtitleTimeListener) {
    readnoteSubtitleVideo.removeEventListener("timeupdate", readnoteSubtitleTimeListener);
    readnoteSubtitleVideo.removeEventListener("seeking", readnoteSubtitleTimeListener);
  }
  clearInterval(readnoteSubtitleRefreshTimer);
  clearInterval(readnoteSubtitleRetryTimer);
  readnoteSubtitleRefreshTimer = null;
  readnoteSubtitleRetryTimer = null;
  readnoteSubtitleRoot?.remove();
  document.getElementById("readnote-subtitle-style")?.remove();
  readnoteSubtitleRoot = null;
  readnoteSubtitleSegments = [];
  readnoteSubtitleVideo = null;
  readnoteSubtitleTimeListener = null;
  readnoteSubtitleActiveId = "";
  readnoteSubtitleTranslationError = "";
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
      "[Readnote Studio Content] Player container not found yet, will retry",
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

  debugLog("[Readnote Studio Content] Injecting note button");

  // Create the note button — a soft rounded pill that floats over the player
  const noteButton = document.createElement("button");
  noteButton.id = "ytd-note-button";
  noteButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right: 7px;">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
    <span>Note</span>
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
    padding: 9px 16px;
    background: #0969da;
    color: white;
    border: none;
    border-radius: 999px;
    font-family: system-ui, -apple-system, "Roboto", sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    cursor: pointer;
    transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
    opacity: 0;
    pointer-events: none;
    box-shadow: 0 4px 14px rgba(0,0,0,0.3);
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
    noteButton.style.background = "#0550ae";
    noteButton.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
    noteButton.style.transform = "translateY(-1px)";
  });

  noteButton.addEventListener("mouseleave", () => {
    noteButton.style.background = "#0969da";
    noteButton.style.boxShadow = "0 4px 14px rgba(0,0,0,0.3)";
    noteButton.style.transform = "translateY(0)";
  });

  // Click handler — save the current moment as a note
  noteButton.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await saveCurrentNote();
  });

  playerContainer.appendChild(noteButton);

  debugLog("[Readnote Studio Content] Note button injected");
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
  debugLog("[Readnote Studio] Saving note");

  const video = document.querySelector("video.html5-main-video");
  if (!video) {
    console.error("[Readnote Studio] No video element found");
    return;
  }

  // Go back 3 seconds to capture what was just said (user reacts after hearing it)
  const currentTime = Math.max(0, Math.floor(video.currentTime) - 3);
  const videoInfo = extractVideoInfo();
  const videoId = new URLSearchParams(window.location.search).get("v");

  const noteButton = ytdNoteButton;
  const originalContent = noteButton ? noteButton.innerHTML : "";

  if (noteButton) {
    noteButton.innerHTML =
      '<span style="letter-spacing: 0.2px;">SAVING...</span>';
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
          '<span style="letter-spacing: 0.2px;">SAVED</span>';
        noteButton.style.background = "#7c8b6f";
      }
      showNoteSavedToast(result.note);
    } else {
      if (noteButton) {
        noteButton.innerHTML =
          '<span style="letter-spacing: 0.2px;">ERROR</span>';
      }
      console.error("[Readnote Studio] Save note error:", result.error);
    }
  } catch (err) {
    if (noteButton) {
      noteButton.innerHTML =
        '<span style="letter-spacing: 0.2px;">ERROR</span>';
    }
    console.error("[Readnote Studio] Save note exception:", err);
  }

  setTimeout(() => {
    if (noteButton) {
      noteButton.innerHTML = originalContent;
      noteButton.style.background = "#0969da";
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
    <div style="font-weight: 700; margin-bottom: 6px; color: #0969da;">Note saved</div>
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
      console.error("Copy failed:", err);
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
    console.error("[Readnote Studio Content] No video element found for seek");
    return;
  }

  debugLog("[Readnote Studio Content] Seeking to:", seconds);
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
  }, 500);
});
