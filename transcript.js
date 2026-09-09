var ReadnoteTranscript = (() => {
  const DISPLAY_MODES = Object.freeze(["bilingual", "off"]);
  const DEFAULT_DISPLAY_MODE = "bilingual";
  const DISPLAY_MODE_STORAGE_KEY = "readnote_bilingual_modes_by_video";
  const LIMITS = Object.freeze({
    minChars: 60,
    idealChars: 180,
    maxChars: 320,
    maxSeconds: 20,
  });

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
      .replace(/([，。；：！？])\s+(?=[\u3400-\u9fff])/g, "$1")
      .replace(/\s+([,.;:!?，。；：！？])/g, "$1")
      .trim();
  }

  function splitOversized(text, maxChars) {
    const parts = [];
    let rest = normalizeText(text);
    while (rest.length > maxChars) {
      const windowText = rest.slice(0, maxChars + 1);
      const lowerBound = Math.floor(maxChars * 0.55);
      let cut = -1;
      for (const pattern of [/[;:；：]\s*/g, /[,，]\s*/g, /\s/g]) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(windowText))) {
          if (match.index >= lowerBound) cut = match.index + match[0].length;
        }
        if (cut > 0) break;
      }
      if (cut <= 0) cut = maxChars;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function groupEntries(entries, limits = LIMITS) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const pieces = [];

    entries.forEach((entry, entryIndex) => {
      const text = normalizeText(entry?.text);
      if (!text) return;
      const start = Number.isFinite(Number(entry.start)) ? Number(entry.start) : 0;
      const duration = Math.max(0, Number(entry.duration) || 0);
      const sentenceParts =
        text.match(/[^.!?;:,。！？；：，]+(?:[.!?;:,。！？；：，]+["')\]”’）】」』]*|$)/g) ||
        [text];
      let consumedChars = 0;

      sentenceParts.forEach((sentencePart) => {
        const cleanPart = normalizeText(sentencePart);
        if (!cleanPart) return;
        splitOversized(cleanPart, limits.maxChars).forEach((part, partIndex, oversizedParts) => {
          const ratio = text.length ? Math.min(1, consumedChars / text.length) : 0;
          pieces.push({
            text: part,
            start: start + duration * ratio,
            semanticEnd:
              /[.!?。！？]["')\]”’）】」』]*$/.test(part) || oversizedParts.length > 1,
            clauseEnd: /[;:,；：，]["')\]”’）】」』]*$/.test(part),
            sourceOrder: `${entryIndex}:${partIndex}`,
          });
          consumedChars += part.length + 1;
        });
      });
    });

    const grouped = [];
    let current = null;
    const flush = () => {
      if (!current || !current.text.trim()) return;
      const index = grouped.length;
      const text = normalizeText(current.text);
      grouped.push({
        id: `segment-${index}-${Math.round(current.start * 1000)}`,
        start: current.start,
        text,
      });
      current = null;
    };

    pieces.forEach((piece) => {
      if (!current) current = { start: piece.start, text: "" };
      current.text = normalizeText(`${current.text} ${piece.text}`);
      const elapsed = Math.max(0, piece.start - current.start);
      const comfortablySized = current.text.length >= limits.minChars;
      const reachedIdeal = current.text.length >= limits.idealChars;
      const atNaturalBoundary =
        piece.semanticEnd ||
        (piece.clauseEnd &&
          (reachedIdeal || current.text.length >= limits.maxChars || elapsed >= limits.maxSeconds));
      const reachedGuardrail =
        atNaturalBoundary &&
        (current.text.length >= limits.maxChars || elapsed >= limits.maxSeconds);
      const reachedHardGuardrail =
        current.text.length >= Math.round(limits.maxChars * 1.2) ||
        elapsed >= limits.maxSeconds + 5;
      if (
        (atNaturalBoundary && (comfortablySized || elapsed >= 8)) ||
        (atNaturalBoundary && reachedIdeal) ||
        reachedGuardrail ||
        reachedHardGuardrail
      ) {
        flush();
      }
    });
    flush();
    return grouped;
  }

  function activeSegment(segments, seconds, maxTailSeconds = 12) {
    if (!Array.isArray(segments) || !segments.length) return null;
    const current = Math.max(0, Number(seconds) || 0);
    let match = null;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const nextStart = Number(segments[index + 1]?.start);
      const end = Number.isFinite(nextStart)
        ? nextStart
        : Number(segment.start) + maxTailSeconds;
      if (current >= Number(segment.start) && current < end) match = segment;
    }
    return match;
  }

  function wrapSubtitle(text) {
    return normalizeText(text);
  }

  function translationCandidates(
    segments,
    startIndex,
    pendingIds,
    windowSize = 48,
    batchSize = 6,
  ) {
    if (!Array.isArray(segments) || !segments.length) return [];
    const start = Math.max(0, Number(startIndex) || 0);
    const pending = pendingIds instanceof Set ? pendingIds : new Set();
    const eligible = segments
      .slice(start, start + windowSize)
      .filter(
        (segment) =>
          segment?.id && !segment.translation && !pending.has(segment.id),
      );
    if (!eligible.length) return [];
    if (eligible[0] === segments[start]) return [eligible[0]];
    return eligible.slice(0, batchSize);
  }

  /**
   * Builds two independent translation lanes around the playback head:
   * one urgent visible subtitle and several forward-looking batches. Keeping
   * this pure makes seek reprioritisation deterministic and easy to test.
   */
  function planTranslationWindow(
    segments,
    startIndex,
    pendingIds,
    { windowSize = 96, windowSeconds = 180, batchSize = 6, batchCount = 3 } = {},
  ) {
    if (!Array.isArray(segments) || !segments.length) {
      return { active: [], batches: [] };
    }
    const start = Math.max(0, Math.min(segments.length - 1, Number(startIndex) || 0));
    const pending = pendingIds instanceof Set ? pendingIds : new Set();
    const activeSegment = segments[start];
    const active = activeSegment?.id && !activeSegment.translation
      ? [activeSegment]
      : [];
    const activeStart = Number(activeSegment?.start);
    const future = segments
      .slice(start + 1, start + 1 + windowSize)
      .filter(
        (segment) =>
          segment?.id &&
          !segment.translation &&
          !pending.has(segment.id) &&
          (!Number.isFinite(activeStart) ||
            !Number.isFinite(Number(segment.start)) ||
            Number(segment.start) - activeStart <= windowSeconds),
      );
    const batches = [];
    const maximum = Math.max(0, batchSize * batchCount);
    for (let index = 0; index < Math.min(future.length, maximum); index += batchSize) {
      batches.push(future.slice(index, index + batchSize));
    }
    return { active, batches };
  }

  function isDisplayMode(value) {
    return DISPLAY_MODES.includes(value);
  }

  async function saveDisplayMode(storage, videoId, mode, updatedAt = Date.now()) {
    if (!storage || !videoId || !isDisplayMode(mode)) return false;
    const stored = await storage.get(DISPLAY_MODE_STORAGE_KEY);
    const modes = { ...(stored?.[DISPLAY_MODE_STORAGE_KEY] || {}) };
    modes[videoId] = { mode, updatedAt };
    const recentModes = Object.fromEntries(
      Object.entries(modes)
        .sort(([, left], [, right]) => (right.updatedAt || 0) - (left.updatedAt || 0))
        .slice(0, 50),
    );
    await storage.set({ [DISPLAY_MODE_STORAGE_KEY]: recentModes });
    return true;
  }

  function textFingerprint(text) {
    const clean = normalizeText(text);
    let hash = 2166136261;
    for (let index = 0; index < clean.length; index += 1) {
      hash ^= clean.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${clean.length}-${(hash >>> 0).toString(36)}`;
  }

  function translationKey(videoId, segment) {
    return `${String(videoId || "")}:zh:semantic:${String(segment?.id || "")}:${textFingerprint(segment?.text)}`;
  }

  return {
    LIMITS,
    DISPLAY_MODES,
    DEFAULT_DISPLAY_MODE,
    DISPLAY_MODE_STORAGE_KEY,
    isDisplayMode,
    saveDisplayMode,
    normalizeText,
    groupEntries,
    activeSegment,
    wrapSubtitle,
    translationCandidates,
    planTranslationWindow,
    textFingerprint,
    translationKey,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ReadnoteTranscript;
}
