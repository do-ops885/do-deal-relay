/**
 * MCP Cursor-Based Pagination
 *
 * Encode/decode cursor state for list pagination.
 * Uses cursor values (last item identifier) instead of offset
 * to remain stable under concurrent item insertions/deletions.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface CursorParams {
  value: string;
  limit?: number;
}

export interface CursorState {
  value: string;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  total: number;
  hasMore: boolean;
}

export function encodeCursor(params: CursorParams): string {
  return btoa(JSON.stringify({ v: params.value, l: params.limit }));
}

export function decodeCursor(cursor: string): CursorState | null {
  try {
    const decoded = JSON.parse(atob(cursor));
    if (typeof decoded.v === "string") {
      return {
        value: decoded.v,
        limit:
          typeof decoded.l === "number"
            ? Math.min(Math.max(1, decoded.l), MAX_PAGE_SIZE)
            : DEFAULT_PAGE_SIZE,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function paginateList<T>(
  items: T[],
  cursor: string | undefined,
  limit: number,
  getCursorValue: (item: T) => string,
): PaginatedResult<T> {
  const effectiveLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  let startIndex = 0;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const foundIndex = items.findIndex(
        (item) => getCursorValue(item) === decoded.value,
      );
      if (foundIndex >= 0) {
        startIndex = foundIndex + 1;
      }
    }
  }

  const slicedItems = items.slice(startIndex, startIndex + effectiveLimit);
  const total = items.length;
  const hasMore = startIndex + effectiveLimit < total;

  let nextCursor: string | undefined;
  if (hasMore && slicedItems.length > 0) {
    const lastItem = slicedItems[slicedItems.length - 1];
    if (lastItem) {
      nextCursor = encodeCursor({
        value: getCursorValue(lastItem),
        limit: effectiveLimit,
      });
    }
  }

  return { items: slicedItems, nextCursor, total, hasMore };
}
