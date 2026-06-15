// ============================================================================
// Body Size Limit Middleware
// ============================================================================

import { jsonResponse } from "../routes/utils";

const DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB

/**
 * Check if request body size exceeds the limit.
 * Returns null if OK, or a Response with 413 if too large.
 */
export function checkBodySize(
  request: Request,
  maxSizeBytes: number = DEFAULT_MAX_SIZE,
): Response | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSizeBytes) {
      return jsonResponse({ error: "Request body too large" }, 413, request);
    }
  }
  return null;
}
