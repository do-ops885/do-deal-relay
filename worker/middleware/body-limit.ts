// ============================================================================
// Body Size Limit Middleware
// ============================================================================

import { jsonResponse } from "../routes/utils";

const DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB

/**
 * Check if request body size exceeds the limit.
 * Security: Validates Content-Length header format per RFC 9110 to prevent body
 * size limit bypasses via malformed, non-numeric, negative, or decimal values.
 * Returns null if OK, or a Response with 400 (malformed) or 413 (too large).
 */
export function checkBodySize(
  request: Request,
  maxSizeBytes: number = DEFAULT_MAX_SIZE,
): Response | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const trimmed = contentLength.trim();
    // RFC 9110 §8.6: Content-Length must consist strictly of 1 or more decimal digits
    if (!/^\d+$/.test(trimmed)) {
      return jsonResponse(
        { error: "Invalid Content-Length header" },
        400,
        request,
      );
    }
    const size = Number(trimmed);
    if (!Number.isSafeInteger(size)) {
      return jsonResponse(
        { error: "Invalid Content-Length header" },
        400,
        request,
      );
    }
    if (size > maxSizeBytes) {
      return jsonResponse({ error: "Request body too large" }, 413, request);
    }
  }
  return null;
}
