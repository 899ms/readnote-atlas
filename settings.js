/** Shared, non-secret AI provider configuration. */
var YTD_SETTINGS = (() => {
  const STORAGE_KEY = "ytd_settings";
  const PROVIDERS = Object.freeze({
    deepseek: Object.freeze({
      label: "DeepSeek",
      defaultBaseUrl: "https://api.deepseek.com",
      defaultModel: "deepseek-v4-flash",
      keyUrl: "https://platform.deepseek.com/api_keys",
      help: "Fast, cost-efficient default for translation and summaries.",
      disableThinking: true,
    }),
    openai: Object.freeze({
      label: "OpenAI",
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4.1-mini",
      keyUrl: "https://platform.openai.com/api-keys",
      help: "Use an OpenAI model with your own API key.",
    }),
    gemini: Object.freeze({
      label: "Google Gemini",
      defaultBaseUrl:
        "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-3.8-flash",
      keyUrl: "https://aistudio.google.com/app/apikey",
      help: "Uses Google's OpenAI-compatible Gemini endpoint.",
    }),
    openrouter: Object.freeze({
      label: "OpenRouter",
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "openai/gpt-4.1-mini",
      keyUrl: "https://openrouter.ai/settings/keys",
      help: "Choose from models offered through your OpenRouter account.",
    }),
    custom: Object.freeze({
      label: "Custom endpoint",
      defaultBaseUrl: "",
      defaultModel: "",
      keyUrl: "",
      help: "Connect any HTTPS service that supports OpenAI Chat Completions.",
    }),
  });
  const DEFAULT_PROVIDER = "deepseek";

  const clean = (value) => (typeof value === "string" ? value.trim() : "");

  function normalizeProvider(value) {
    return Object.hasOwn(PROVIDERS, value) ? value : DEFAULT_PROVIDER;
  }

  function normalizeBaseUrl(value, fallback) {
    const candidate = clean(value) || fallback;
    if (!candidate) return "";
    try {
      const url = new URL(candidate);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol !== "https:" && !local) return fallback;
      url.search = "";
      url.hash = "";
      return url.href.replace(/\/+$/, "");
    } catch (_error) {
      return fallback;
    }
  }

  function normalize(input = {}) {
    const provider = normalizeProvider(input.provider);
    const storedConfigs =
      input.providerConfigs && typeof input.providerConfigs === "object"
        ? input.providerConfigs
        : {};
    const providerConfigs = Object.fromEntries(
      Object.entries(PROVIDERS).map(([id, definition]) => {
        const stored = storedConfigs[id] || {};
        const legacyActive = id === provider && !storedConfigs[id];
        const legacyProviderRecognized = input.provider === id || !input.provider;
        return [
          id,
          {
            apiKey: clean(legacyActive ? input.aiApiKey : stored.apiKey),
            baseUrl: normalizeBaseUrl(
              legacyActive && legacyProviderRecognized ? input.aiBaseUrl : stored.baseUrl,
              definition.defaultBaseUrl,
            ),
            model:
              clean(legacyActive && legacyProviderRecognized ? input.aiModel : stored.model) ||
              definition.defaultModel,
          },
        ];
      }),
    );
    const active = providerConfigs[provider];
    return {
      provider,
      providerConfigs,
      aiApiKey: active.apiKey,
      aiBaseUrl: active.baseUrl,
      aiModel: active.model,
      supadataApiKey: clean(input.supadataApiKey),
    };
  }

  function migrateLegacySettings(input = {}) {
    return {
      settings: normalize(input),
      migrated: Boolean(input && !input.providerConfigs),
    };
  }

  function serialize(settings = {}) {
    const normalized = normalize(settings);
    return {
      provider: normalized.provider,
      providerConfigs: normalized.providerConfigs,
      supadataApiKey: normalized.supadataApiKey,
    };
  }

  function providerLabel(provider) {
    return PROVIDERS[normalizeProvider(provider)].label;
  }

  function chatCompletionsUrl(settings = {}) {
    const baseUrl =
      clean(settings.aiBaseUrl) || PROVIDERS[DEFAULT_PROVIDER].defaultBaseUrl;
    return /\/chat\/completions$/i.test(baseUrl)
      ? baseUrl
      : `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  }

  function hostPermissionPattern(settings = {}) {
    try {
      return `${new URL(settings.aiBaseUrl).origin}/*`;
    } catch (_error) {
      return "";
    }
  }

  function canonicalYouTubeUrl(videoId) {
    const normalized = String(videoId || "").trim();
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(normalized)) {
      throw new Error("Invalid YouTube video ID.");
    }
    return `https://www.youtube.com/watch?v=${normalized}`;
  }

  return {
    STORAGE_KEY,
    PROVIDERS,
    DEFAULT_PROVIDER,
    normalizeProvider,
    normalize,
    migrateLegacySettings,
    serialize,
    providerLabel,
    chatCompletionsUrl,
    hostPermissionPattern,
    canonicalYouTubeUrl,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = YTD_SETTINGS;
}
