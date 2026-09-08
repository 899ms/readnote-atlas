import type { HighlightRecord, SourceRecord } from "./types";

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderTags(tags: string[]): string {
  if (tags.length === 0) {
    return "tags:\n  - reading/source";
  }

  return ["tags:", ...tags.map((tag) => `  - ${tag}`)].join("\n");
}

function fallback(value: string, emptyValue = ""): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : emptyValue;
}

function renderVocabulary(highlight: HighlightRecord): string {
  if (highlight.vocabulary.length === 0) {
    return "";
  }

  return [
    "**Vocabulary / Lingo**",
    ...highlight.vocabulary.map((entry) => `- **${entry.term}**: ${entry.explanation}`)
  ].join("\n");
}

function renderHighlight(highlight: HighlightRecord): string {
  const lines = [
    `### ${highlight.createdAt.slice(0, 10)} - ${highlight.id}`,
    "",
    "> [!quote] Highlight",
    ...highlight.text.split("\n").map((line) => `> ${line}`),
    ""
  ];

  const note = fallback(highlight.note);
  if (note) {
    lines.push(`**My note:** ${note}`, "");
  }

  const translation = fallback(highlight.translation);
  if (translation) {
    lines.push(`**中文理解:** ${translation}`, "");
  }

  const vocabulary = renderVocabulary(highlight);
  if (vocabulary) {
    lines.push(vocabulary, "");
  }

  lines.push(`^${highlight.id}`);
  return lines.join("\n");
}

export function renderObsidianNote(source: SourceRecord, highlights: HighlightRecord[]): string {
  const frontmatter = [
    "---",
    `title: ${yamlString(source.title)}`,
    `source_url: ${yamlString(source.url)}`,
    `site: ${yamlString(source.siteName)}`,
    `first_read_at: ${yamlString(source.firstReadAt)}`,
    `last_read_at: ${yamlString(source.lastReadAt)}`,
    renderTags(source.tags),
    "---"
  ].join("\n");

  const sortedHighlights = [...highlights].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return [
    frontmatter,
    "",
    `# ${source.title}`,
    "",
    `[Original source](${source.url})`,
    "",
    "## Full Text Snapshot",
    "",
    source.capturedText.trim(),
    "",
    "## Highlights",
    "",
    sortedHighlights.length > 0
      ? sortedHighlights.map((highlight) => renderHighlight(highlight)).join("\n\n")
      : "_No highlights saved yet._",
    ""
  ].join("\n");
}
