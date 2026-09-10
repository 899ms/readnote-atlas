const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../settings.js");

test("provider profiles normalize independently and expose the active profile", () => {
  const normalized = settings.normalize({
    provider: "openai",
    supadataApiKey: " supadata ",
    providerConfigs: {
      deepseek: { apiKey: "deep-key", model: "deep-model" },
      openai: { apiKey: " open-key ", model: "gpt-custom" },
    },
  });
  assert.equal(normalized.provider, "openai");
  assert.equal(normalized.aiApiKey, "open-key");
  assert.equal(normalized.aiBaseUrl, "https://api.openai.com/v1");
  assert.equal(normalized.aiModel, "gpt-custom");
  assert.equal(normalized.providerConfigs.deepseek.apiKey, "deep-key");
  assert.equal(normalized.supadataApiKey, "supadata");
  assert.deepEqual(Object.keys(settings.serialize(normalized)).sort(), [
    "provider",
    "providerConfigs",
    "supadataApiKey",
  ]);
  assert.equal(
    settings.chatCompletionsUrl(normalized),
    "https://api.openai.com/v1/chat/completions",
  );
});

test("legacy single-provider settings migrate without losing secrets", () => {
  const first = settings.migrateLegacySettings({
    provider: "custom",
    aiApiKey: "custom-secret",
    aiBaseUrl: "https://api.example.com/v1",
    aiModel: "example-model",
    supadataApiKey: " supadata-secret ",
  });
  assert.equal(first.migrated, true);
  assert.equal(first.settings.provider, "custom");
  assert.equal(first.settings.aiApiKey, "custom-secret");
  assert.equal(first.settings.aiBaseUrl, "https://api.example.com/v1");
  assert.equal(first.settings.providerConfigs.custom.model, "example-model");
  const second = settings.migrateLegacySettings(first.settings);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.settings, first.settings);
});

test("provider catalog includes first-party presets plus a custom endpoint", () => {
  assert.equal(settings.providerLabel("deepseek"), "DeepSeek");
  assert.equal(settings.providerLabel("gemini"), "Google Gemini");
  const custom = settings.normalize({
    provider: "custom",
    providerConfigs: {
      custom: {
        apiKey: "key",
        baseUrl: "https://api.vendor.test/v1/",
        model: "vendor-model",
      },
    },
  });
  assert.equal(custom.aiBaseUrl, "https://api.vendor.test/v1");
  assert.equal(settings.hostPermissionPattern(custom), "https://api.vendor.test/*");
});

test("base URL normalization removes query and hash before endpoint joining", () => {
  const custom = settings.normalize({
    provider: "custom",
    providerConfigs: {
      custom: {
        apiKey: "key",
        baseUrl: "https://api.vendor.test/v1/?token=unsafe#fragment",
        model: "vendor-model",
      },
    },
  });
  assert.equal(custom.aiBaseUrl, "https://api.vendor.test/v1");
  assert.equal(
    settings.chatCompletionsUrl(custom),
    "https://api.vendor.test/v1/chat/completions",
  );
});

test("Supadata receives a canonical YouTube URL", () => {
  assert.equal(
    settings.canonicalYouTubeUrl("ydTeb_I0b94"),
    "https://www.youtube.com/watch?v=ydTeb_I0b94",
  );
  assert.throws(() => settings.canonicalYouTubeUrl('\"><script>'), /Invalid YouTube video ID/);
});
