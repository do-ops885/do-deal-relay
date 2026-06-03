import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  paginateList,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../worker/lib/mcp/pagination";

describe("MCP Pagination", () => {
  const items = ["alpha", "bravo", "charlie", "delta", "echo"];

  it("should encode and decode cursor", () => {
    const cursor = encodeCursor({ value: "charlie", limit: 5 });
    expect(cursor).toBeDefined();
    const decoded = decodeCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded!.value).toBe("charlie");
    expect(decoded!.limit).toBe(5);
  });

  it("should return null for invalid cursor", () => {
    expect(decodeCursor("invalid-base64!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("should paginate with default page size", () => {
    const result = paginateList(items, undefined, DEFAULT_PAGE_SIZE, (i) => i);
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeUndefined();
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(false);
  });

  it("should paginate with small limit", () => {
    const result = paginateList(items, undefined, 2, (i) => i);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();
    expect(result.hasMore).toBe(true);
  });

  it("should paginate from cursor", () => {
    const first = paginateList(items, undefined, 2, (i) => i);
    expect(first.items).toEqual(["alpha", "bravo"]);

    const second = paginateList(items, first.nextCursor, 2, (i) => i);
    expect(second.items).toEqual(["charlie", "delta"]);
  });

  it("should clamp limit to MAX_PAGE_SIZE", () => {
    const result = paginateList(items, undefined, 999, (i) => i);
    expect(result.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });
});
