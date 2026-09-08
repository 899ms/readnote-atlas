function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function notebookName(path) {
  return String(path || "Readnote Studio Notebook.md").split("/").filter(Boolean).at(-1)?.replace(/\.md$/i, "") ?? "Readnote Studio Notebook";
}

export function isCompanionStatusPageRequest(method, pathname) {
  return method === "GET" && (pathname === "/" || pathname === "/index.html");
}

export function renderCompanionStatusPage({ status, notionPageId, obsidianNotebookPath }) {
  const noteName = escapeHtml(notebookName(obsidianNotebookPath));
  const notionId = escapeHtml(notionPageId || "Not configured");
  const obsidianPath = escapeHtml(obsidianNotebookPath || "Not configured");
  const profileName = escapeHtml(status?.profileName ?? "Local Reader");
  const translation = status?.translationConfigured
    ? `${escapeHtml(status.translationProvider)} / ${escapeHtml(status.translationModel)}`
    : "Not configured";
  const obsidian = status?.obsidianConfigured ? noteName : "Not configured";
  const notion = status?.notionConfigured ? "Configured" : "Not configured";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"%3E%3Crect width="32" height="32" rx="8" fill="%23f5f5f7"/%3E%3Ccircle cx="16" cy="16" r="7" fill="%2330d158"/%3E%3C/svg%3E' />
    <title>Readnote Studio Companion</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #24292f;
        --muted: #57606a;
        --line: #d0d7de;
        --panel: #ffffff;
        --blue: #0969da;
        --green: #2da44e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f6f8fa;
        color: var(--ink);
        font: 15px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      }

      main {
        width: min(520px, calc(100vw - 40px));
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        box-shadow: 0 3px 12px rgba(31, 35, 40, 0.08);
        padding: 28px;
        backdrop-filter: blur(24px);
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--line);
      }

      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
        letter-spacing: 0;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: #dafbe1;
        color: #1a7f37;
        padding: 6px 10px;
        font-size: 13px;
        font-weight: 650;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--green);
        box-shadow: 0 0 0 4px rgba(45, 164, 78, 0.14);
      }

      dl {
        margin: 20px 0 0;
        display: grid;
        gap: 14px;
      }

      .row {
        display: grid;
        grid-template-columns: 92px 1fr;
        gap: 18px;
        align-items: start;
      }

      dt {
        color: var(--muted);
        font-size: 13px;
      }

      dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .value {
        font-weight: 620;
      }

      .detail {
        margin-top: 2px;
        color: var(--muted);
        font-size: 13px;
      }

      a {
        color: var(--blue);
        text-decoration: none;
      }

      @media (max-width: 520px) {
        main {
          padding: 22px;
          border-radius: 8px;
        }

        header {
          align-items: flex-start;
          flex-direction: column;
          gap: 12px;
        }

        .row {
          grid-template-columns: 1fr;
          gap: 2px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Readnote Studio Companion</h1>
        <div class="status"><span class="dot"></span>Running</div>
      </header>
      <dl>
        <div class="row">
          <dt>Profile</dt>
          <dd>
            <div class="value">${profileName}</div>
            <div class="detail"><a href="/setup">Open setup</a></div>
          </dd>
        </div>
        <div class="row">
          <dt>Translate</dt>
          <dd>
            <div class="value">${translation}</div>
          </dd>
        </div>
        <div class="row">
          <dt>Notebook</dt>
          <dd>
            <div class="value">${obsidian}</div>
            <div class="detail">${obsidianPath}</div>
          </dd>
        </div>
        <div class="row">
          <dt>Notion</dt>
          <dd>
            <div class="value">${notion}</div>
            <div class="detail">Page ${notionId}</div>
          </dd>
        </div>
      </dl>
    </main>
  </body>
</html>`;
}

export function renderSetupPage({ settings, saved = false }) {
  const provider = escapeHtml(settings.translationProvider);
  const model = escapeHtml(settings.translationModel);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Readnote Studio Setup</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #24292f;
        --muted: #57606a;
        --line: #d0d7de;
        --blue: #0969da;
        --green: #2da44e;
        --bg: #f6f8fa;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font: 15px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      }
      main {
        width: min(720px, calc(100vw - 40px));
        margin: 48px auto;
      }
      header {
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      form {
        display: grid;
        gap: 22px;
      }
      section {
        display: grid;
        gap: 12px;
        border-top: 1px solid var(--line);
        padding-top: 22px;
      }
      h2 {
        margin: 0;
        font-size: 15px;
        letter-spacing: 0;
      }
      label {
        display: grid;
        gap: 7px;
        color: var(--muted);
        font-size: 13px;
      }
      input, select {
        width: 100%;
        height: 38px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        color: var(--ink);
        padding: 0 11px;
        font: inherit;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .notice {
        border-left: 3px solid var(--green);
        padding: 8px 0 8px 12px;
        color: #1a7f37;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      button {
        height: 38px;
        border: 0;
        border-radius: 9px;
        background: var(--blue);
        color: white;
        padding: 0 16px;
        font-weight: 650;
        font: inherit;
      }
      a { color: var(--blue); text-decoration: none; }
      @media (max-width: 640px) {
        main { margin: 28px auto; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Readnote Studio Setup</h1>
        <p>Configure your local profile, model provider, Obsidian notebook, and Notion page. Secrets stay in local .env.local.</p>
      </header>
      ${saved ? '<p class="notice">Saved. Restart the companion if you changed provider credentials.</p>' : ""}
      <form method="post" action="/setup">
        <section>
          <h2>Profile</h2>
          <label>Local profile name
            <input name="profileName" value="${escapeHtml(settings.profileName)}" />
          </label>
        </section>
        <section>
          <h2>Translation</h2>
          <div class="grid">
            <label>Provider
              <select name="translationProvider">
                <option value="deepseek"${provider === "deepseek" ? " selected" : ""}>DeepSeek</option>
                <option value="openai"${provider === "openai" ? " selected" : ""}>OpenAI</option>
                <option value="minimax"${provider === "minimax" ? " selected" : ""}>MiniMax</option>
              </select>
            </label>
            <label>Model
              <input name="translationModel" value="${model}" />
            </label>
          </div>
          <label>API key
            <input name="translationApiKey" type="password" value="" placeholder="Paste your provider API key" autocomplete="off" />
          </label>
        </section>
        <section>
          <h2>Obsidian</h2>
          <label>Markdown notebook path
            <input name="obsidianPath" value="${escapeHtml(settings.obsidianPath)}" placeholder="/Users/you/Documents/Obsidian/Readnote Studio.md" />
          </label>
        </section>
        <section>
          <h2>Notion</h2>
          <label>Internal integration token
            <input name="notionToken" type="password" value="" placeholder="secret_..." autocomplete="off" />
          </label>
          <label>Reading notes page id
            <input name="notionPageId" value="${escapeHtml(settings.notionPageId)}" />
          </label>
        </section>
        <div class="actions">
          <button type="submit">Save</button>
          <a href="/">Status</a>
        </div>
      </form>
    </main>
  </body>
</html>`;
}
