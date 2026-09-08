import { existsSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "./companion-env.mjs";

export const ENV_PATH = ".env.local";

function clean(value) {
  return String(value ?? "").replaceAll("\r", "").replaceAll("\n", "").trim();
}

function isPlaceholder(value) {
  const v = clean(value);
  return !v || v.startsWith("<") && v.endsWith(">");
}

export function envValue(key, fallback = "") {
  return process.env[key] ?? fallback;
}

export function currentSettings(env = process.env) {
  return normalizeSetupSettings({
    profileName: env.READNOTE_PROFILE_NAME ?? "Local Reader",
    translationProvider: env.READNOTE_TRANSLATION_PROVIDER ?? env.READING_NOTEBOOK_TRANSLATION_PROVIDER ?? "deepseek",
    translationModel:
      env.READNOTE_TRANSLATION_MODEL ??
      env.READNOTE_DEEPSEEK_MODEL ??
      env.READING_NOTEBOOK_TRANSLATION_MODEL ??
      env.READING_NOTEBOOK_DEEPSEEK_MODEL ??
      "deepseek-v4-flash",
    translationApiKey:
      env.READNOTE_TRANSLATION_API_KEY ??
      env.DEEPSEEK_API_KEY ??
      env.OPENAI_API_KEY ??
      env.MINIMAX_API_KEY ??
      "",
    obsidianPath: env.READNOTE_OBSIDIAN_PATH ?? env.READING_NOTEBOOK_OBSIDIAN_PATH ?? "",
    notionToken: env.READNOTE_NOTION_TOKEN ?? env.NOTION_TOKEN ?? "",
    notionPageId: env.READNOTE_NOTION_PAGE_ID ?? env.READING_NOTEBOOK_NOTION_PAGE_ID ?? ""
  });
}

export function normalizeSetupSettings(input) {
  return {
    profileName: clean(input.profileName) || "Local Reader",
    translationProvider: clean(input.translationProvider) || "deepseek",
    translationModel: clean(input.translationModel) || "deepseek-v4-flash",
    translationApiKey: clean(input.translationApiKey),
    obsidianPath: clean(input.obsidianPath),
    notionToken: clean(input.notionToken),
    notionPageId: clean(input.notionPageId)
  };
}

export function envTextForSettings(settings) {
  const normalized = normalizeSetupSettings(settings);
  return [
    "# Readnote Studio local configuration. Do not commit this file.",
    `READNOTE_PROFILE_NAME=${normalized.profileName}`,
    "",
    `READNOTE_TRANSLATION_PROVIDER=${normalized.translationProvider}`,
    `READNOTE_TRANSLATION_MODEL=${normalized.translationModel}`,
    `READNOTE_TRANSLATION_API_KEY=${normalized.translationApiKey}`,
    "",
    `READNOTE_OBSIDIAN_PATH=${normalized.obsidianPath}`,
    "",
    `READNOTE_NOTION_TOKEN=${normalized.notionToken}`,
    `READNOTE_NOTION_PAGE_ID=${normalized.notionPageId}`,
    ""
  ].join("\n");
}

export function saveSettings(settings, envPath = ENV_PATH) {
  const normalized = normalizeSetupSettings(settings);
  writeFileSync(envPath, envTextForSettings(normalized), "utf8");
  Object.assign(process.env, {
    READNOTE_PROFILE_NAME: normalized.profileName,
    READNOTE_TRANSLATION_PROVIDER: normalized.translationProvider,
    READNOTE_TRANSLATION_MODEL: normalized.translationModel,
    READNOTE_TRANSLATION_API_KEY: normalized.translationApiKey,
    READNOTE_OBSIDIAN_PATH: normalized.obsidianPath,
    READNOTE_NOTION_TOKEN: normalized.notionToken,
    READNOTE_NOTION_PAGE_ID: normalized.notionPageId
  });
  return normalized;
}

export function loadLocalSettings(envPath = ENV_PATH) {
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }
  return currentSettings();
}

export function maskSecret(value) {
  const text = clean(value);
  if (!text || isPlaceholder(text)) {
    return "Not configured";
  }
  if (text.length <= 10) {
    return "Configured";
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function statusForSettings(settings) {
  const normalized = normalizeSetupSettings(settings);
  return {
    profileName: normalized.profileName,
    translationConfigured: Boolean(normalized.translationApiKey),
    translationProvider: normalized.translationProvider,
    translationModel: normalized.translationModel,
    obsidianConfigured: Boolean(normalized.obsidianPath) && !isPlaceholder(normalized.obsidianPath),
    notionConfigured: Boolean(normalized.notionToken && normalized.notionPageId) && !isPlaceholder(normalized.notionToken),
  };
}
