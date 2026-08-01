export const MAX_REDDIT_FLAG_CANDIDATES = 10;

const INVALID_COMMENT_PATTERNS = [
  /^(?:expired|invalid|dead|404)[.!?]?$/,
  /^(?:(?:this|the)\s+)?(?:deal|offer|code|link)\s+(?:is\s+)?(?:expired|invalid|dead|not\s+working)[.!?]?$/,
  /^(?:it|this|the\s+(?:deal|offer|code|link))\s+doesn['’]?t\s+work[.!?]?$/,
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isInvalidComment(body: string): boolean {
  const normalized = body.toLowerCase().trim();
  return INVALID_COMMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function collectFlagAuthors(
  value: unknown,
  botUsername: string,
): Set<string> {
  const authors = new Set<string>();
  function visit(node: unknown): void {
    if (authors.size >= MAX_REDDIT_FLAG_CANDIDATES) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    if (record.kind === "t1") {
      const data = asRecord(record.data);
      const body = data?.body;
      const author = data?.author;
      if (
        typeof body === "string" &&
        typeof author === "string" &&
        author !== "[deleted]" &&
        author.toLowerCase() !== botUsername.toLowerCase() &&
        isInvalidComment(body)
      ) {
        authors.add(author);
      }
      visit(data?.replies);
      return;
    }
    visit(asRecord(record.data)?.children);
  }
  visit(value);
  return authors;
}
