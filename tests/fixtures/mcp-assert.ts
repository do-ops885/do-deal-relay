/**
 * Typed assertion helpers for MCP unit tests.
 *
 * Replaces `as any` casts on MCP content unions, structuredContent
 * payloads, and JSON response bodies with runtime-checked narrowing:
 * a wrong shape fails the test with a clear message instead of
 * silently disabling type checking.
 */

/** Narrows the first MCP content item to text and returns its payload. */
export function firstText(items: unknown[]): string {
  const first = items[0];
  if (first === null || typeof first !== "object" || !("text" in first)) {
    throw new Error("expected first MCP content item to carry text");
  }
  // Tool results carry { type: "text", text }; resource reads carry
  // { uri, mimeType, text } with no type field. Accept both.
  const item = first as { type?: unknown; text: unknown };
  if (item.type !== undefined && item.type !== "text") {
    throw new Error("expected first MCP content item to be text");
  }
  if (typeof item.text !== "string") {
    throw new Error("expected first MCP content item to carry string text");
  }
  return item.text;
}

/** Narrows an unknown value to a plain object record. */
export function jsonRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected JSON object");
  }
  return value as Record<string, unknown>;
}

/** Narrows an unknown value to an array of records. */
export function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new Error("expected array");
  }
  return value as Array<Record<string, unknown>>;
}

/** Reads an MCP result's structuredContent as a record for assertions. */
export function structuredPayload(result: {
  structuredContent?: unknown;
}): Record<string, unknown> {
  return jsonRecord(result.structuredContent);
}

/** Parses the first MCP text content item as a JSON record. */
export function firstJson(items: unknown[]): Record<string, unknown> {
  return jsonRecord(JSON.parse(firstText(items)));
}
