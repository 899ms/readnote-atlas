const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("video translation exposes only bilingual On and Off", () => {
  const panel = read("sidepanel.html");
  const panelScript = read("sidepanel.js");
  const content = read("content.js");
  assert.match(panel, /data-transcript-mode="bilingual"[\s\S]*?>On</);
  assert.match(panel, /data-transcript-mode="off"[\s\S]*?>Off</);
  assert.doesNotMatch(panel, /data-transcript-mode="(?:original|zh)"/);
  assert.match(
    panelScript,
    /let currentTranscriptMode = ReadnoteTranscript\.DEFAULT_DISPLAY_MODE/,
  );
  assert.match(panelScript, /ReadnoteTranscript\.DISPLAY_MODE_STORAGE_KEY/);
  assert.match(content, /ReadnoteTranscript\.DISPLAY_MODE_STORAGE_KEY/);
  assert.match(content, /data-mode="bilingual">On</);
  assert.match(content, /data-mode="off">Off</);
  assert.doesNotMatch(content, />EN<|>关闭<|>中英</);
});

test("Overview is one comprehensive Chinese discussion summary", () => {
  const panel = read("sidepanel.html");
  const panelScript = read("sidepanel.js");
  const prompt = read("prompts/analysis.md");
  const background = read("background.js");
  assert.match(panel, /id="overviewContent"/);
  assert.doesNotMatch(panel, />Chapters<|>Key Quotes</);
  assert.match(prompt, /overviewZh/);
  assert.doesNotMatch(prompt, /keyQuotes|key quotes/i);
  assert.match(background, /overviewZh/);
  assert.match(panelScript, /normalizeCachedAnalysis\(cached\.analysis\)/);
  assert.match(panelScript, /function normalizeCachedAnalysis/);
});

test("player subtitles prefetch a batch and expose quiet style controls", () => {
  const content = read("content.js");
  const background = read("background.js");
  assert.match(content, /action: "translateOverlayBatch"/);
  assert.match(content, /SUBTITLE_PREFETCH_COUNT/);
  assert.match(background, /handleTranslateOverlayBatch/);
  assert.match(content, /data-style-action="font"/);
  assert.match(content, /data-style-action="smaller"/);
  assert.match(content, /data-style-action="higher"/);
  assert.match(content, /readnote_subtitle_style/);
  assert.match(content, /data-controls-toggle/);
  assert.match(content, /rn-subtitle-settings/);
  assert.match(content, /ReadnoteTranscript\.wrapSubtitle/);
  assert.match(content, /if \(readnoteSubtitleMode !== "bilingual"\) return/);
});

test("article page actions collapse behind one quiet launcher", () => {
  const article = read("src/article-reader/index.ts");
  const css = read("article-reader.css");
  assert.match(article, /rk-page-actions-toggle/);
  assert.match(article, /aria-expanded/);
  assert.match(article, /rk-page-actions-menu/);
  assert.match(article, /function closePageActionsMenu/);
  assert.match(css, /\.rk-page-actions:not\(\.is-open\) \.rk-page-actions-menu/);
  assert.match(css, /\.rk-page-actions-toggle[\s\S]*?opacity: 0;/);
});
