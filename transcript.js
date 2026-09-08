var ReadnoteTranscript = (() => {
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

  /**
   * Keeps an overlay caption to two balanced lines. The split prefers natural
   * punctuation or a word boundary near the middle and never changes the text
   * stored in the transcript or translation cache.
   */
  function wrapSubtitle(text) {
    const clean = normalizeText(text);
    const hasCjk = /[\u3400-\u9fff]/.test(clean);
    const singleLineLimit = hasCjk ? 28 : 64;
    if (clean.length <= singleLineLimit) return clean;

    const midpoint = clean.length / 2;
    const lower = clean.length * 0.28;
    const upper = clean.length * 0.72;
    const candidates = [];
    const boundary = /[,.;:!?，。；：！？]\s*|\s+/g;
    let match;
    while ((match = boundary.exec(clean))) {
      const index = match.index + match[0].length;
      if (index >= lower && index <= upper) candidates.push(index);
    }
    const cut = candidates.length
      ? candidates.reduce((best, index) =>
          Math.abs(index - midpoint) < Math.abs(best - midpoint) ? index : best,
        )
      : Math.round(midpoint);
    return `${clean.slice(0, cut).trim()}\n${clean.slice(cut).trim()}`;
  }

  function translationKey(videoId, segment) {
    return `${String(videoId || "")}:zh:semantic:${String(segment?.id || "")}`;
  }

  return {
    LIMITS,
    normalizeText,
    groupEntries,
    activeSegment,
    wrapSubtitle,
    translationKey,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ReadnoteTranscript;
}
