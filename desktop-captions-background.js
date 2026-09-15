// This worker module is part of Readnote Atlas, not a second extension.
// Pairing is local and restricted by the helper to the installed Atlas origin.
(() => {
const DESKTOP_URL = "http://127.0.0.1:8792";
const YOUTUBE_URL_PATTERNS = ["https://youtube.com/*", "https://www.youtube.com/*"];
const isYouTubeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["youtube.com", "www.youtube.com"].includes(url.hostname);
  } catch (_) { return false; }
};
let desktopSession = "";
let pairing;
let retryAfter = 0;

async function session() {
  if (desktopSession) return desktopSession;
  if (Date.now() < retryAfter) return "";
  if (!pairing) pairing = (async () => {
    try {
      const response = await fetch(`${DESKTOP_URL}/pair`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(1200),
      });
      if (!response.ok) throw new Error("Desktop helper not paired");
      const reply = await response.json();
      if (!/^[a-f0-9]{64}$/.test(reply.session || "")) throw new Error("Invalid desktop session");
      desktopSession = reply.session;
      return desktopSession;
    } catch (_) { retryAfter = Date.now() + 5000; return ""; }
  })().finally(() => { pairing = null; });
  return pairing;
}

let desktopRefreshTimer;
let lastDesktopConnection = 0;
function keepDesktopSourceResponsive() {
  lastDesktopConnection = Date.now();
  if (desktopRefreshTimer) return;
  // Wake the paused page from the extension, rather than depending on a
  // hidden page's throttled timers. Stop when the local helper disconnects.
  desktopRefreshTimer = setInterval(() => {
    if (Date.now() - lastDesktopConnection > 5000) {
      clearInterval(desktopRefreshTimer);
      desktopRefreshTimer = null;
      return;
    }
    void refreshYouTube().catch(() => {});
  }, 1000);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== "atlas-desktop-state" || sender.id !== chrome.runtime.id || !sender.tab?.id ||
      !isYouTubeUrl(sender.url) || !message.state) return;
  (async () => {
    const token = await session();
    if (!token) return {};
    const tab = await chrome.tabs.get(sender.tab.id);
    const window = await chrome.windows.get(tab.windowId);
    const response = await fetch("http://127.0.0.1:8792/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...message.state, tabId: tab.id,
        sourceVisible: tab.active && window.focused && window.state !== "minimized" && message.state.pageVisible,
        windowState: window.state }),
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) { desktopSession = ""; return {}; }
    if (message.state.enabled && (message.state.playing || message.state.keepPaused)) keepDesktopSourceResponsive();
    return { ...await response.json(), connected: true };
  })().then(respond).catch(() => { desktopSession = ""; retryAfter = Date.now() + 1000; respond({}); });
  return true;
});

async function refreshYouTube() {
  const tabGroups = await Promise.all(YOUTUBE_URL_PATTERNS.map(url => chrome.tabs.query({ url })));
  const tabs = [...new Map(tabGroups.flat().filter(tab => Number.isInteger(tab.id)).map(tab => [tab.id, tab])).values()];
  await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: "atlas-desktop-refresh" }).catch(() => {})));
}
chrome.windows.onFocusChanged.addListener(() => { void refreshYouTube().catch(() => {}); });
chrome.windows.onBoundsChanged.addListener(() => { void refreshYouTube().catch(() => {}); });
chrome.tabs.onActivated.addListener(() => { void refreshYouTube().catch(() => {}); });
})();
