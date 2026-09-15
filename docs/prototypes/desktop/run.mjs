// Local-only disposable macOS prototype. No production extension files changed.
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { selectSource } from "./state.mjs";
import { CaptionCommands } from "./commands.mjs";

const sourceDir = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(sourceDir, "../../..");
const build = join(root, "dist/desktop-captions-prototype");
const extensionDir = join(build, "chrome-bridge");
const appDir = join(build, "Atlas Captions Prototype.app");
const executable = join(appDir, "Contents/MacOS/AtlasCaptions");
mkdirSync(extensionDir, { recursive: true });
mkdirSync(join(appDir, "Contents/MacOS"), { recursive: true });

// Reuse only the prototype's local session capability so an installed bridge
// can reconnect after restarting the helper. No API keys or captions on disk.
const capabilityFile = join(build, "session-capability");
const token = existsSync(capabilityFile) ? readFileSync(capabilityFile, "utf8").trim() : randomBytes(32).toString("hex");
writeFileSync(capabilityFile, token, { mode: 0o600 });
writeFileSync(join(extensionDir, "session.js"), `const DESKTOP_SESSION = ${JSON.stringify(token)};\n`, { mode: 0o600 });
for (const file of ["bridge-background.js", "bridge-content.js"]) copyFileSync(join(sourceDir, file), join(extensionDir, file));
writeFileSync(join(extensionDir, "manifest.json"), JSON.stringify({
  manifest_version: 3, name: "Atlas Desktop Captions — LOCAL PROTOTYPE", version: "0.0.1",
  description: "Local-only bridge from existing Atlas YouTube captions to the macOS desktop preview.",
  permissions: ["scripting"], host_permissions: ["https://www.youtube.com/*", "http://127.0.0.1:8792/*"],
  background: { service_worker: "bridge-background.js" },
  content_scripts: [{ matches: ["https://www.youtube.com/*"], js: ["bridge-content.js"] }],
}, null, 2));
writeFileSync(join(appDir, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>AtlasCaptions</string>
<key>CFBundleIdentifier</key><string>local.readnote.atlas.captions.prototype</string>
<key>CFBundleName</key><string>Atlas Captions Prototype</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>`);
console.log("Compiling the local desktop prototype…");
const compilation = spawnSync("swiftc", [join(sourceDir, "CaptionWindowState.swift"), join(sourceDir, "FloatingCaptions.swift"), "-o", executable], { stdio: "inherit" });
if (compilation.status !== 0) process.exit(compilation.status || 1);

const sources = new Map();
const commands = new CaptionCommands();
let selectedId;
let lastStatus = "";
let lastResult = null;
let app;
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.headers.host !== "127.0.0.1:8792" ||
      (req.headers.origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin)) ||
      req.headers.authorization !== `Bearer ${token}`) {
    res.writeHead(403); res.end('{"error":"unauthorized"}'); return;
  }
  try {
    if (req.method === "POST") {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 64_000) throw new Error("body too large");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (req.url === "/state" && Number.isInteger(body.tabId)) {
        const state = { ...body, en: String(body.en || "").slice(0, 8000), zh: String(body.zh || "").slice(0, 8000), receivedAt: Date.now() };
        sources.set(body.tabId, state);
        if (body.result) lastResult = body.result;
        const command = commands.next(body.tabId, body.result, body.videoId);
        res.end(JSON.stringify({ command })); return;
      }
      if (req.url === "/command" && ["rewind", "playback", "forward", "bookmark"].includes(body.action)) {
        const state = sources.get(body.tabId);
        if (!state || state.videoId !== body.videoId || Date.now() - state.receivedAt > 3500) throw new Error("source unavailable");
        const command = { id: randomUUID(), action: body.action, videoId: state.videoId, time: Number(body.time), queuedAt: Date.now() };
        commands.enqueue(state.tabId, command);
        res.end(JSON.stringify({ id: command.id })); return;
      }
    }
    if (req.method === "GET" && req.url === "/state") {
      const state = selectSource(sources, selectedId);
      selectedId = state?.tabId;
      for (const [id, item] of sources) if (Date.now() - item.receivedAt > 10_000) { sources.delete(id); commands.delete(id); }
      const status = JSON.stringify({ source: state?.tabId || null, video: state?.videoId || null,
        playing: !!state?.playing, sourceVisible: !!state?.sourceVisible, window: state?.windowState || "none" });
      if (status !== lastStatus) { console.log(status); lastStatus = status; }
      res.end(JSON.stringify({ state, result: lastResult })); return;
    }
    res.writeHead(404); res.end("{}");
  } catch (_) { res.writeHead(400); res.end('{"error":"invalid request"}'); }
});
server.on("error", error => { console.error(`Local bridge could not start: ${error.message}`); process.exit(1); });
server.listen(8792, "127.0.0.1", () => {
  console.log(`Local prototype bridge: ${extensionDir}`);
  console.log("Waiting for YouTube. No preview or duplicate caption surface opens on startup.");
  console.log("Quit from the Atlas menu-bar icon to stop both app and bridge.");
  app = spawn(executable, [], { stdio: "inherit", env: { ...process.env, READNOTE_DESKTOP_SESSION: token } });
  app.on("exit", () => server.close(() => process.exit(0)));
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { app?.kill(); server.close(() => process.exit(0)); });
