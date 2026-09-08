function dateParts(isoDate) {
  const date = String(isoDate).slice(0, 10);
  return {
    month: date.slice(0, 7),
    date
  };
}

function timePart(isoDate) {
  return String(isoDate).slice(11, 16);
}

function cleanHeadingText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim() || "Untitled";
}

function findHeadingIndex(content, heading) {
  if (content.startsWith(`${heading}\n`) || content === heading) {
    return 0;
  }

  const index = content.indexOf(`\n${heading}\n`);
  return index === -1 ? -1 : index + 1;
}

function findSectionEnd(content, headingIndex, nextHeadingPattern) {
  nextHeadingPattern.lastIndex = headingIndex + 1;
  return nextHeadingPattern.exec(content)?.index ?? content.length;
}

export function renderExcerptBlock(excerpt) {
  const lines = [
    `##### ${timePart(excerpt.createdAt)}`,
    "",
    ...String(excerpt.text ?? "")
      .split("\n")
      .map((line) => `> ${line}`)
  ];

  if (String(excerpt.note ?? "").trim()) {
    lines.push("", `Note: ${String(excerpt.note).trim()}`);
  }

  if (String(excerpt.translation ?? "").trim()) {
    lines.push("", `中文: ${String(excerpt.translation).trim()}`);
  }

  return lines.join("\n");
}

function renderArticleSection(excerpt) {
  const articleHeading = `#### ${cleanHeadingText(excerpt.sourceTitle)}`;
  const sourceLine = `[Source](${excerpt.sourceUrl})`;
  return `${articleHeading}\n\n${sourceLine}\n\n${renderExcerptBlock(excerpt)}`;
}

function appendArticleSection(content, excerpt) {
  return `${String(content).trimEnd()}\n\n${renderArticleSection(excerpt)}\n`;
}

function appendToExistingArticleOnDate(content, dateHeading, excerpt) {
  const dateIndex = findHeadingIndex(content, dateHeading);
  if (dateIndex === -1) {
    return null;
  }

  const dateEnd = findSectionEnd(content, dateIndex, /\n#{2,3} /g);
  const dateContent = content.slice(dateIndex, dateEnd);
  const articleHeading = `#### ${cleanHeadingText(excerpt.sourceTitle)}`;
  const articleRelativeIndex = findHeadingIndex(dateContent, articleHeading);
  if (articleRelativeIndex === -1) {
    return null;
  }

  const articleIndex = dateIndex + articleRelativeIndex;
  const nextHeadingPattern = /\n#{2,4} /g;
  const insertIndex = Math.min(findSectionEnd(content, articleIndex, nextHeadingPattern), dateEnd);
  return `${content.slice(0, insertIndex).trimEnd()}\n\n${renderExcerptBlock(excerpt)}\n${content.slice(insertIndex)}`;
}

function appendDateSectionToMonth(content, monthHeading, dateHeading, excerpt) {
  const monthIndex = findHeadingIndex(content, monthHeading);
  if (monthIndex === -1) {
    return null;
  }

  const monthEnd = findSectionEnd(content, monthIndex, /\n## /g);
  return `${content.slice(0, monthEnd).trimEnd()}\n\n${dateHeading}\n\n${renderArticleSection(excerpt)}\n${content.slice(monthEnd)}`;
}

function appendArticleSectionToDate(content, dateHeading, excerpt) {
  const dateIndex = findHeadingIndex(content, dateHeading);
  if (dateIndex === -1) {
    return null;
  }

  const dateEnd = findSectionEnd(content, dateIndex, /\n#{2,3} /g);
  return `${content.slice(0, dateEnd).trimEnd()}\n\n${renderArticleSection(excerpt)}\n${content.slice(dateEnd)}`;
}

export function appendExcerpt(existingContent, excerpt) {
  const trimmed = String(existingContent).trimEnd();
  const { month, date } = dateParts(excerpt.createdAt);
  const monthHeading = `## ${month}`;
  const dateHeading = `### ${date}`;

  if (!trimmed.includes(monthHeading)) {
    return appendArticleSection(`${trimmed}\n\n${monthHeading}\n\n${dateHeading}`, excerpt);
  }

  if (!trimmed.includes(dateHeading)) {
    return appendDateSectionToMonth(trimmed, monthHeading, dateHeading, excerpt) ?? appendArticleSection(`${trimmed}\n\n${dateHeading}`, excerpt);
  }

  return appendToExistingArticleOnDate(trimmed, dateHeading, excerpt) ?? appendArticleSectionToDate(trimmed, dateHeading, excerpt) ?? appendArticleSection(trimmed, excerpt);
}
