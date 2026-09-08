import { execFileSync } from "node:child_process";

function cleanValue(value) {
  return String(value ?? "").trim();
}

export function parseScutilProxyOutput(output) {
  const settings = {};
  for (const line of String(output ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9]+)\s*:\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }

    settings[match[1]] = cleanValue(match[2]);
  }

  return settings;
}

function envProxyUrl(env = process.env) {
  return (
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    ""
  ).trim();
}

function enabled(value) {
  return String(value) === "1" || String(value).toLowerCase() === "yes";
}

function proxyFrom(prefix, settings) {
  if (!enabled(settings[`${prefix}Enable`])) {
    return "";
  }

  const host = cleanValue(settings[`${prefix}Proxy`]);
  const port = cleanValue(settings[`${prefix}Port`]);
  if (!host || !port) {
    return "";
  }

  return `http://${host}:${port}`;
}

export function proxyUrlFromSettings(settings, env = process.env) {
  return envProxyUrl(env) || proxyFrom("HTTPS", settings) || proxyFrom("HTTP", settings);
}

export function currentMacOSProxyUrl(env = process.env) {
  const explicit = envProxyUrl(env);
  if (explicit) {
    return explicit;
  }

  try {
    const output = execFileSync("/usr/sbin/scutil", ["--proxy"], {
      encoding: "utf8",
      timeout: 2000
    });
    return proxyUrlFromSettings(parseScutilProxyOutput(output), {});
  } catch {
    return "";
  }
}
