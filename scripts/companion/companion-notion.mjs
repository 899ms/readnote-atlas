const NOTION_VERSION = "2022-06-28";

function richText(content, linkUrl) {
  const text = {
    content: String(content ?? "").slice(0, 2000)
  };
  if (linkUrl) {
    text.link = { url: linkUrl };
  }

  return [
    {
      type: "text",
      text
    }
  ];
}

function paragraph(content) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(content) }
  };
}

export function buildNotionExcerptBlocks(excerpt) {
  const date = String(excerpt.createdAt ?? new Date().toISOString()).slice(0, 10);
  const title = String(excerpt.sourceTitle ?? "Untitled").replace(/\s+/g, " ").trim() || "Untitled";
  const blocks = [
    {
      object: "block",
      type: "heading_3",
      heading_3: { rich_text: richText(`${date} · ${title}`) }
    },
    paragraph("Source: "),
    {
      object: "block",
      type: "quote",
      quote: { rich_text: richText(String(excerpt.text ?? "")) }
    }
  ];

  blocks[1].paragraph.rich_text = richText("Source", excerpt.sourceUrl);

  if (String(excerpt.note ?? "").trim()) {
    blocks.push(paragraph(`Note: ${String(excerpt.note).trim()}`));
  }

  if (String(excerpt.translation ?? "").trim()) {
    blocks.push(paragraph(`中文: ${String(excerpt.translation).trim()}`));
  }

  return blocks;
}

export async function syncExcerptToNotion(excerpt, options = {}) {
  const token = options.token ?? process.env.READNOTE_NOTION_TOKEN ?? process.env.NOTION_TOKEN ?? "";
  const pageId = options.pageId ?? process.env.READNOTE_NOTION_PAGE_ID ?? process.env.READING_NOTEBOOK_NOTION_PAGE_ID ?? "";
  if (!token || !pageId) {
    return { status: "not_configured" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "notion-version": NOTION_VERSION
    },
    body: JSON.stringify({ children: buildNotionExcerptBlocks(excerpt) })
  });

  if (!response.ok) {
    throw new Error(`notion_request_failed_${response.status}`);
  }

  return { status: "synced" };
}
