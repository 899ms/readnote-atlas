const YTD_OPTIONS = (() => {
  const PREVIEW_STORAGE_PREFIX = "youtubeDigestPreview:";
  const COPY = { en: { pageTitle: "Readnote Atlas Settings", saveSettings: "Save changes" } };

  function translate(_language, key) {
    return COPY.en[key] || "";
  }

  function createStorageAdapter(chromeApi, fallbackStorage) {
    const chromeStorage = chromeApi?.storage?.local;
    const memoryStorage = new Map();
    const fallbackKeys = () => {
      const keys = [];
      try {
        for (let index = 0; index < (fallbackStorage?.length || 0); index += 1) {
          const key = fallbackStorage.key(index);
          if (key?.startsWith(PREVIEW_STORAGE_PREFIX)) keys.push(key);
        }
      } catch (_error) {}
      return keys;
    };
    const readValue = (key) => {
      try {
        const raw = fallbackStorage?.getItem(`${PREVIEW_STORAGE_PREFIX}${key}`);
        if (raw != null) return JSON.parse(raw);
      } catch (_error) {}
      return memoryStorage.get(key);
    };
    return {
      async get(keys) {
        if (chromeStorage) return chromeStorage.get(keys);
        const requested = keys === null
          ? [...new Set([...memoryStorage.keys(), ...fallbackKeys().map((key) => key.slice(PREVIEW_STORAGE_PREFIX.length))])]
          : Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(requested.map((key) => [key, readValue(key)]).filter(([, value]) => value !== undefined));
      },
      async set(items) {
        if (chromeStorage) return chromeStorage.set(items);
        for (const [key, value] of Object.entries(items)) {
          memoryStorage.set(key, value);
          try { fallbackStorage?.setItem(`${PREVIEW_STORAGE_PREFIX}${key}`, JSON.stringify(value)); } catch (_error) {}
        }
      },
      async remove(keys) {
        if (chromeStorage) return chromeStorage.remove(keys);
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          memoryStorage.delete(key);
          try { fallbackStorage?.removeItem(`${PREVIEW_STORAGE_PREFIX}${key}`); } catch (_error) {}
        }
      },
      async clear() {
        if (chromeStorage) return chromeStorage.clear();
        memoryStorage.clear();
        for (const key of fallbackKeys()) {
          try { fallbackStorage.removeItem(key); } catch (_error) {}
        }
      },
    };
  }

  function cloneProfiles(settingsApi, settings) {
    return Object.fromEntries(
      Object.keys(settingsApi.PROVIDERS).map((id) => [id, { ...settings.providerConfigs[id] }]),
    );
  }

  async function requestProviderPermission(root, settingsApi, settings) {
    if (settings.provider !== "custom" || !root.chrome?.permissions) return true;
    const origin = settingsApi.hostPermissionPattern(settings);
    if (!origin) return false;
    // Start the request directly inside the Save click's user activation.
    // Requesting an already granted origin resolves without another prompt.
    return root.chrome.permissions.request({ origins: [origin] });
  }

  async function closeSettings(root) {
    try {
      const tab = await root.chrome?.tabs?.getCurrent?.();
      if (tab?.id) {
        await root.chrome.tabs.remove(tab.id);
        return;
      }
    } catch (_error) {}
    if (root.history?.length > 1) root.history.back();
    else root.close?.();
  }

  function initialize(root = globalThis) {
    const doc = root.document;
    const settingsApi = root.YTD_SETTINGS;
    if (!doc || !settingsApi) return;
    let fallbackStorage = null;
    try { fallbackStorage = root.localStorage; } catch (_error) {}
    const storage = createStorageAdapter(root.chrome, fallbackStorage);
    const form = doc.getElementById("settingsForm");
    const providerSelect = doc.getElementById("providerSelect");
    const keyInput = doc.getElementById("aiApiKey");
    const modelInput = doc.getElementById("aiModel");
    const baseUrlInput = doc.getElementById("aiBaseUrl");
    const supadataInput = doc.getElementById("supadataApiKey");
    const status = doc.getElementById("saveStatus");
    const dataStatus = doc.getElementById("dataStatus");
    let profiles = {};
    let activeProvider = settingsApi.DEFAULT_PROVIDER;

    for (const [id, provider] of Object.entries(settingsApi.PROVIDERS)) {
      const option = doc.createElement("option");
      option.value = id;
      option.textContent = provider.label;
      providerSelect.append(option);
    }

    function captureProfile() {
      if (!activeProvider) return;
      profiles[activeProvider] = {
        apiKey: keyInput.value,
        model: modelInput.value,
        baseUrl: baseUrlInput.value,
      };
    }

    function showProvider(providerId) {
      activeProvider = settingsApi.normalizeProvider(providerId);
      const definition = settingsApi.PROVIDERS[activeProvider];
      const profile = profiles[activeProvider] || {};
      providerSelect.value = activeProvider;
      keyInput.value = profile.apiKey || "";
      modelInput.value = profile.model || definition.defaultModel;
      baseUrlInput.value = profile.baseUrl || definition.defaultBaseUrl;
      doc.getElementById("baseUrlField").hidden = activeProvider !== "custom";
      doc.getElementById("providerHelp").textContent = definition.help;
      const link = doc.getElementById("providerKeyLink");
      link.hidden = !definition.keyUrl;
      link.href = definition.keyUrl || "#";
      link.textContent = definition.keyUrl ? `Get ${definition.label} API key ↗` : "";
    }

    async function loadSettings() {
      try {
        const stored = await storage.get(settingsApi.STORAGE_KEY);
        const migration = settingsApi.migrateLegacySettings(stored[settingsApi.STORAGE_KEY]);
        const settings = migration.settings;
        profiles = cloneProfiles(settingsApi, settings);
        supadataInput.value = settings.supadataApiKey;
        showProvider(settings.provider);
        if (migration.migrated) {
          await storage.set({ [settingsApi.STORAGE_KEY]: settingsApi.serialize(settings) });
        }
      } catch (_error) {
        status.textContent = "Could not load settings.";
      }
    }

    async function loadKnowledgeStatus() {
      const knowledgeStatus = doc.getElementById("knowledgeStatus");
      try {
        const response = await fetch("http://127.0.0.1:8791/health");
        if (!response.ok) throw new Error("unavailable");
        const health = await response.json();
        const connected = [health.obsidianConfigured && "Obsidian", health.notionConfigured && "Notion"].filter(Boolean);
        knowledgeStatus.textContent = connected.length ? `Connected · ${connected.join(" + ")}` : "Setup needed";
        knowledgeStatus.classList.add("is-ready");
      } catch (_error) {
        knowledgeStatus.textContent = "Companion offline";
      }
    }

    providerSelect.addEventListener("change", () => {
      captureProfile();
      showProvider(providerSelect.value);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      captureProfile();
      const settings = settingsApi.normalize({ provider: activeProvider, providerConfigs: profiles, supadataApiKey: supadataInput.value });
      if (!settings.supadataApiKey) { status.textContent = "Add a Supadata API key."; return; }
      if (!settings.aiApiKey) { status.textContent = `Add a ${settingsApi.providerLabel(settings.provider)} API key.`; return; }
      if (!settings.aiModel || !settings.aiBaseUrl) { status.textContent = "Add a model and base URL."; return; }
      status.textContent = "Saving…";
      try {
        if (!(await requestProviderPermission(root, settingsApi, settings))) {
          status.textContent = "Allow access to the custom API origin to continue.";
          return;
        }
        await storage.set({ [settingsApi.STORAGE_KEY]: settingsApi.serialize(settings) });
        profiles = cloneProfiles(settingsApi, settings);
        status.textContent = `${settingsApi.providerLabel(settings.provider)} is active.`;
      } catch (_error) { status.textContent = "Could not save settings."; }
    });

    doc.getElementById("backBtn").addEventListener("click", () => void closeSettings(root));
    doc.getElementById("clearCacheBtn").addEventListener("click", async () => {
      const all = await storage.get(null);
      const keys = Object.keys(all).filter((key) => key.startsWith("digest_"));
      if (keys.length) await storage.remove(keys);
      dataStatus.textContent = `Cleared ${keys.length} cached digest${keys.length === 1 ? "" : "s"}.`;
    });
    doc.getElementById("clearNotesBtn").addEventListener("click", async () => {
      await storage.remove("ytd_notes");
      dataStatus.textContent = "Deleted all saved notes.";
    });
    doc.getElementById("resetBtn").addEventListener("click", async () => {
      if (!root.confirm("Delete API keys, cached digests, translations and notes?")) return;
      await storage.clear();
      await loadSettings();
      dataStatus.textContent = "All Readnote Atlas data was deleted.";
    });

    const load = async () => { await loadSettings(); await loadKnowledgeStatus(); };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", load, { once: true });
    else void load();
  }

  return { COPY, translate, createStorageAdapter, cloneProfiles, requestProviderPermission, closeSettings, initialize };
})();

if (typeof module !== "undefined" && module.exports) module.exports = YTD_OPTIONS;
if (typeof document !== "undefined") YTD_OPTIONS.initialize();
