const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const options = require("../options.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function createLocalStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("Settings copy is English-only", () => {
  assert.equal(options.translate("en", "pageTitle"), "Readnote Atlas Settings");
  assert.equal(options.translate("zh-CN", "pageTitle"), "Readnote Atlas Settings");
  assert.equal(options.translate("en", "saveSettings"), "Save settings");
  assert.equal(
    options.translate("zh-CN", "clearedDigests", { count: 2 }),
    "Cleared 2 cached digests.",
  );

  assert.deepEqual(Object.keys(options.COPY), ["en"]);

  const html = read("options.html");
  const referencedKeys = [
    ...html.matchAll(/data-i18n(?:-html|-aria-label)?="([^"]+)"/g),
  ].map((match) => match[1]);
  for (const key of referencedKeys) {
    assert.ok(options.COPY.en[key], `Missing English copy for ${key}`);
  }
  assert.doesNotMatch(JSON.stringify(options.COPY), /[\p{Script=Han}]/u);
  assert.doesNotMatch(JSON.stringify(options.COPY), /—/);
  assert.doesNotMatch(html, /—/);
});

test("non-extension preview safely stores settings data", async () => {
  const localStorage = createLocalStorage();
  const firstSession = options.createStorageAdapter(null, localStorage);

  await firstSession.set({ sample: "saved" });

  const reopenedSession = options.createStorageAdapter(null, localStorage);
  assert.deepEqual(await reopenedSession.get("sample"), { sample: "saved" });
});

test("Settings has no interface language switch", () => {
  const html = read("options.html");
  assert.doesNotMatch(html, /language-switch|data-language=/);
  assert.doesNotMatch(html, /[\p{Script=Han}]/u);
});

test("Settings stays focused on providers, knowledge destinations, and local data", () => {
  const html = read("options.html");
  assert.match(html, /placeholder="Paste your Supadata key"/);
  assert.match(html, /placeholder="Paste your DeepSeek key"/);
  assert.match(html, /https:\/\/dash\.supadata\.ai\/auth\/sign-up/);
  assert.match(html, /https:\/\/platform\.deepseek\.com\/api_keys/);
  assert.match(html, /Knowledge base/);
  assert.match(html, /data-i18n="localData"/);
  assert.doesNotMatch(html, /coding agent|customizationPrompt/i);
});
