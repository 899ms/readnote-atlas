export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  return url.toString();
}

export function stableHash(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (const char of input) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}

export async function sourceIdFromUrl(rawUrl: string): Promise<string> {
  return `src_${stableHash(canonicalizeUrl(rawUrl))}`;
}

export function highlightIdFromParts(parts: {
  sourceId: string;
  text: string;
  prefix: string;
  suffix: string;
  createdAt: string;
}): string {
  return `hlt_${stableHash(
    [parts.sourceId, parts.text, parts.prefix, parts.suffix, parts.createdAt].join("\n")
  )}`;
}
