/**
 * MCP Pagination and Progress Notification Utilities
 *
 * Provides cursor-based pagination for list endpoints and
 * progress notifications for long-running tool calls.
 *
 * @module worker/lib/mcp/utils
 */

import type { Env } from "../../types";

// ============================================================================
// Pagination Utilities
// ============================================================================

/**
 * Encode a pagination cursor from offset and limit
 */
export function encodeCursor(offset: number, limit: number): string {
  return btoa(JSON.stringify({ offset, limit, t: Date.now() }));
}

/**
 * Decode a pagination cursor to offset and limit
 */
export function decodeCursor(
  cursor: string,
): { offset: number; limit: number } | null {
  try {
    const decoded = JSON.parse(atob(cursor));
    if (
      typeof decoded.offset === "number" &&
      typeof decoded.limit === "number"
    ) {
      return { offset: decoded.offset, limit: decoded.limit };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Paginate an array and return items with next cursor
 */
export function paginate<T>(
  items: T[],
  cursor: string | undefined,
  defaultLimit: number,
): { items: T[]; nextCursor: string | undefined; total: number } {
  const offset = cursor ? (decodeCursor(cursor)?.offset ?? 0) : 0;
  const limit = cursor
    ? (decodeCursor(cursor)?.limit ?? defaultLimit)
    : defaultLimit;

  const total = items.length;
  const sliced = items.slice(offset, offset + limit);
  const hasMore = offset + limit < total;
  const nextCursor = hasMore ? encodeCursor(offset + limit, limit) : undefined;

  return { items: sliced, nextCursor, total };
}

// ============================================================================
// Progress Notification Utilities
// ============================================================================

/**
 * Progress notification structure per MCP spec
 */
export interface ProgressNotification {
  progressToken: string | number;
  progress: number;
  total?: number;
  message?: string;
}

/**
 * Send a progress notification to the client via SSE
 *
 * In stateless HTTP mode, we embed progress in the response _meta field
 * since we cannot push notifications between request/response cycles.
 */
export function createProgressMeta(
  progressToken: string | number,
  progress: number,
  total?: number,
  message?: string,
): { _meta: { progress: ProgressNotification } } {
  return {
    _meta: {
      progress: {
        progressToken,
        progress,
        total,
        message,
      },
    },
  };
}

/**
 * Execute a long-running operation with progress tracking
 *
 * Breaks the operation into steps and returns progress metadata
 * for the final response.
 */
export async function withProgress<T extends Record<string, unknown>>(
  progressToken: string | number | undefined,
  totalSteps: number,
  operation: (
    step: number,
    reportProgress: (step: number, message?: string) => void,
  ) => Promise<T>,
): Promise<T & { _meta?: { progress?: ProgressNotification } }> {
  if (!progressToken) {
    return await operation(0, () => {});
  }

  let currentStep = 0;
  let result: T;

  const reportProgress = (step: number, message?: string) => {
    currentStep = step;
  };

  result = await operation(currentStep, reportProgress);

  return {
    ...result,
    _meta: {
      progress: {
        progressToken,
        progress: currentStep,
        total: totalSteps,
        message: `Completed ${currentStep}/${totalSteps} steps`,
      },
    },
  };
}
