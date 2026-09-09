var ReadnoteKnowledge = (() => {
  function youtubeSourceId(url) {
    try {
      const parsed = new URL(String(url || ""));
      return `youtube:${parsed.searchParams.get("v") || "unknown"}`;
    } catch (_error) {
      return "youtube:unknown";
    }
  }

  function noteToExcerpt(note) {
    const createdAt = new Date(Number(note?.createdAt) || Date.now()).toISOString();
    return {
      id: String(note?.id || `note_${Date.now()}`),
      sourceId: youtubeSourceId(note?.timestampedUrl),
      sourceTitle: String(note?.videoTitle || "Untitled Video").trim(),
      sourceUrl: String(note?.timestampedUrl || "").trim(),
      text: String(note?.text || note?.personalNote || "").trim(),
      note: note?.text ? String(note?.personalNote || "").trim() : "",
      translation: String(note?.translation || "").trim(),
      createdAt,
    };
  }

  function syncState(result) {
    if (!result || result.ok !== true) {
      return { status: "unavailable", obsidian: "unknown", notion: "unknown" };
    }
    const obsidian = String(result.obsidian || "not_configured");
    const notion = String(result.notion || "not_configured");
    const status =
      obsidian === "synced" || notion === "synced" ? "synced" : "not_configured";
    return { status, obsidian, notion };
  }

  return { noteToExcerpt, syncState };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ReadnoteKnowledge;
}
