importScripts("session.js");

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
    void refreshYouTube();
  }, 1000);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== "desktop-prototype-state" || !sender.tab?.id ||
      !sender.url?.startsWith("https://www.youtube.com/")) return;
  (async () => {
    const tab = await chrome.tabs.get(sender.tab.id);
    const window = await chrome.windows.get(tab.windowId);
    const response = await fetch("http://127.0.0.1:8792/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DESKTOP_SESSION}` },
      body: JSON.stringify({ ...message.state, tabId: tab.id,
        sourceVisible: tab.active && window.focused && window.state !== "minimized" && message.state.pageVisible,
        windowState: window.state }),
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return {};
    if (message.state.enabled && (message.state.playing || message.state.keepPaused)) keepDesktopSourceResponsive();
    return { ...await response.json(), connected: true };
  })().then(respond).catch(() => respond({}));
  return true;
});

async function refreshYouTube() {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: "desktop-prototype-refresh" }).catch(() => {})));
}
chrome.windows.onFocusChanged.addListener(() => void refreshYouTube());
chrome.windows.onBoundsChanged.addListener(() => void refreshYouTube());
chrome.tabs.onActivated.addListener(() => void refreshYouTube());
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  for (const tab of tabs) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["bridge-content.js"] }).catch(() => {});
  }
});
