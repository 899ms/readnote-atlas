const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("manifest exposes the unified article and video product", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const packageJson = JSON.parse(read("package.json"));
  const [youtubeLayer, articleLayer] = manifest.content_scripts;

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Readnote Studio");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(packageJson.version, manifest.version);
  assert.deepEqual(youtubeLayer.js, ["transcript.js", "content.js"]);
  assert.deepEqual(articleLayer.js, ["article-reader.js"]);
  assert.ok(articleLayer.matches.includes("https://*/*"));
  assert.ok(articleLayer.exclude_matches.includes("https://www.youtube.com/*"));
  assert.ok(articleLayer.css.includes("article-reader.css"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:8791/*"));
});

test("published copy states the source-first and user-owned knowledge promise", () => {
  const readme = read("README.md");
  const chineseReadme = read("README.zh-CN.md");
  const product = read("PRODUCT.md");

  assert.match(readme, /Translation is a reading aid, not the destination/);
  assert.match(readme, /Obsidian or Notion knowledge base/);
  assert.match(readme, /subtitle layer directly over the player/);
  assert.match(readme, /github\.com\/pheobepotato\/readnote/);
  assert.match(readme, /youtube-digest\/releases\/tag\/v1\.2\.0/);
  assert.match(chineseReadme, /翻译只是阅读辅助，不是终点/);
  assert.match(chineseReadme, /播放器画面内直接显示英文与简体中文字幕/);
  assert.match(product, /Source → bilingual understanding → precise selection/);
});

test("video UI includes full transcript, knowledge sync, and player subtitle controls", () => {
  const panel = read("sidepanel.html");
  const panelScript = read("sidepanel.js");
  const contentScript = read("content.js");

  assert.match(panel, />Full Transcript</);
  assert.match(panel, /data-tab="overview"/);
  assert.match(panel, /data-tab="notes"/);
  assert.match(panelScript, /knowledge-sync-badge/);
  assert.match(panelScript, /action: "syncNote"/);
  assert.match(contentScript, /data-mode="bilingual">On/);
  assert.match(contentScript, /data-mode="off">Off/);
  assert.match(contentScript, /action: "translateOverlayBatch"/);
  assert.match(contentScript, /ReadnoteTranscript\.activeSegment/);
  assert.match(contentScript, /result\?\.success \? 60_000 : 10_000/);
  assert.match(panelScript, /personalNote/);
  assert.match(panelScript, /Add a personal note/);
});

test("all product surfaces use the restrained Readnote visual language", () => {
  const surfaces = [
    read("sidepanel.css"),
    read("options.css"),
    read("content.js"),
    read("docs/preview.html"),
  ].join("\n");
  assert.match(surfaces, /#0969da/);
  assert.match(surfaces, /#24292f/);
  assert.doesNotMatch(surfaces, /#c8674f|#b25742|terracotta/i);
  assert.match(read("PRODUCT.md"), /Readnote visual language/);
});

test("settings explains and links the local knowledge companion", () => {
  const html = read("options.html");
  const script = read("options.js");
  assert.match(html, /Knowledge base · 个人知识库/);
  assert.match(html, /http:\/\/127\.0\.0\.1:8791\/setup/);
  assert.match(html, /npm run companion/);
  assert.match(script, /127\.0\.0\.1:8791\/health/);
  assert.doesNotMatch(html, /coding agent|customizationPrompt/i);
});

test("runtime has no source-file credentials or retired model", () => {
  const runtime = [
    read("background.js"),
    read("content.js"),
    read("sidepanel.js"),
    read("options.js"),
    read("settings.js"),
  ].join("\n");
  assert.doesNotMatch(runtime, /importScripts\s*\(\s*["']config\.js/);
  assert.doesNotMatch(runtime, /deepseek-chat/);
  assert.doesNotMatch(runtime, /\bsk-[A-Za-z0-9_-]{20,}\b/);
});

test("published prompt files contain their runtime sections", () => {
  assert.match(read("prompts/analysis.md"), /## System prompt/);
  assert.match(read("prompts/explain.md"), /## System prompt/);
  assert.match(read("prompts/note-cleanup.md"), /## System prompt/);
  assert.match(read("prompts/translation.md"), /## Shared base rules/);
});
