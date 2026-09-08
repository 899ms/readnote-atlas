import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnvFile } from "./companion-env.mjs";
import { currentSettings, normalizeSetupSettings, saveSettings, statusForSettings } from "./companion-config.mjs";
import { appendExcerpt } from "./companion-notebook.mjs";
import { syncExcerptToNotion } from "./companion-notion.mjs";
import { translateParagraphs, translationProviderStatus } from "./companion-openai.mjs";
import { isCompanionStatusPageRequest, renderCompanionStatusPage, renderSetupPage } from "./companion-status.mjs";
import { applyCorsForAllowedOrigin, hasAllowedBrowserOrigin } from "./companion-security.mjs";

loadEnvFile(".env.local");

const port = Number(process.env.READNOTE_PORT ?? process.env.READING_NOTEBOOK_PORT ?? 8791);
const companionOrigin = `http://127.0.0.1:${port}`;

function activeSettings() {
  return currentSettings();
}

function obsidianNotebookPath() {
  return activeSettings().obsidianPath;
}

function notionPageId() {
  return activeSettings().notionPageId;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function ensureNotebook() {
  const notebookPath = obsidianNotebookPath();
  if (!notebookPath) {
    return false;
  }

  mkdirSync(dirname(notebookPath), { recursive: true });
  if (!existsSync(notebookPath)) {
    writeFileSync(
      notebookPath,
      [
        "---",
        "title: Readnote Studio",
        "tags:",
        "  - reading/notebook",
        "---",
        "",
        "# Readnote Studio",
        "",
        "## Inbox",
        ""
      ].join("\n"),
      "utf8"
    );
  }
  return true;
}

async function handleSyncExcerpt(request, response) {
  const body = JSON.parse(await readRequestBody(request));
  const excerpt = body.excerpt;
  if (!excerpt?.id || !excerpt?.text || !excerpt?.sourceUrl) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "invalid_excerpt" }));
    return;
  }

  const notebookPath = obsidianNotebookPath();
  const obsidianConfigured = ensureNotebook();
  if (obsidianConfigured) {
    const existing = readFileSync(notebookPath, "utf8");
    writeFileSync(notebookPath, appendExcerpt(existing, excerpt), "utf8");
  }
  const notion = await syncExcerptToNotion(excerpt, { pageId: notionPageId() });

  response.writeHead(200, {
    "content-type": "application/json"
  });
  response.end(
    JSON.stringify({
      ok: true,
      obsidian: obsidianConfigured ? "synced" : "not_configured",
      notion: notion.status,
      notionPageId: notionPageId()
    })
  );
}

function parseFormBody(body) {
  const params = new URLSearchParams(body);
  return Object.fromEntries(params.entries());
}

async function handleSetup(request, response) {
  const existing = activeSettings();
  const input = normalizeSetupSettings(parseFormBody(await readRequestBody(request)));
  const settings = saveSettings({
    ...input,
    translationApiKey: input.translationApiKey || existing.translationApiKey,
    notionToken: input.notionToken || existing.notionToken
  });

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(renderSetupPage({ settings, saved: true }));
}

async function handleTranslate(request, response) {
  const body = JSON.parse(await readRequestBody(request));
  try {
    const translations = await translateParagraphs(body);
    response.writeHead(200, {
      "content-type": "application/json"
    });
    response.end(JSON.stringify({ translations }));
  } catch (error) {
    const message = String(error?.message ?? error);
    response.writeHead(message.endsWith("_api_key_missing") ? 501 : 502, {
      "content-type": "application/json"
    });
    response.end(JSON.stringify({ error: message }));
  }
}

createServer((request, response) => {
  if (!hasAllowedBrowserOrigin(request, companionOrigin)) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "origin_not_allowed" }));
    return;
  }
  applyCorsForAllowedOrigin(request, response, companionOrigin);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (isCompanionStatusPageRequest(request.method, url.pathname)) {
    const settings = activeSettings();
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      renderCompanionStatusPage({
        status: statusForSettings(settings),
        notionPageId: settings.notionPageId,
        obsidianNotebookPath: settings.obsidianPath
      })
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/setup") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderSetupPage({ settings: activeSettings() }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/setup") {
    handleSetup(request, response).catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: String(error?.message ?? error) }));
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    const translation = translationProviderStatus();
    const settings = activeSettings();
    const status = statusForSettings(settings);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        notionConfigured: status.notionConfigured,
        obsidianConfigured: status.obsidianConfigured,
        translationConfigured: translation.configured
      })
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/sync-excerpt") {
    handleSyncExcerpt(request, response).catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: String(error?.message ?? error) }));
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/translate") {
    handleTranslate(request, response).catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: String(error?.message ?? error) }));
    });
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
}).listen(port, "127.0.0.1", () => {
  console.log(`Readnote Studio companion listening at http://127.0.0.1:${port}`);
});
