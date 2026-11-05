// ============================================================================
// Body Size Limit Middleware
// ============================================================================

import { jsonResponse } from "../routes/utils";

export const DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB

export interface BodyLimitResult {
  /** Non-null when the request must be rejected (400 or 413). */
  response: Response | null;
  /**
   * A Request carrying the already-read bytes. Always use this instance
   * downstream: the original body stream has been consumed.
   */
  request: Request;
}

/**
 * Header-only pre-check. Returns null if OK, or a Response with 400
 * (malformed) or 413 (declared too large).
 *
 * This is not sufficient on its own: a streamed/chunked request can omit
 * Content-Length. Use enforceBodyLimit for the actual byte-counting guard.
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

/**
 * Enforce the configured limit against the actual bytes read from the
 * request body, not only the declared Content-Length. This closes the
 * chunked/streamed bypass. The body is buffered up to maxSizeBytes and
 * returned as a fresh Request so downstream parsers still have a usable
 * stream; once the limit is exceeded the source stream is cancelled and
 * a 413 is returned.
 */
export async function enforceBodyLimit(
  request: Request,
  maxSizeBytes: number = DEFAULT_MAX_SIZE,
): Promise<BodyLimitResult> {
  const headerResponse = checkBodySize(request, maxSizeBytes);
  if (headerResponse) {
    return { response: headerResponse, request };
  }

  // GET/HEAD have no request body semantics.
  if (request.method === "GET" || request.method === "HEAD") {
    return { response: null, request };
  }
  if (!request.body) {
    return { response: null, request };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxSizeBytes) {
        try {
          await reader.cancel();
        } catch {
          // best-effort stream cancellation
        }
        return {
          response: jsonResponse(
            { error: "Request body too large" },
            413,
            request,
          ),
          request,
        };
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // best-effort stream cancellation
    }
    return {
      response: jsonResponse(
        { error: "Failed to read request body" },
        400,
        request,
      ),
      request,
    };
  }

  if (total === 0) {
    // An explicitly empty body is still a valid body for JSON parsers that
    // treat it as missing; keep the original request so headers are intact.
    return { response: null, request };
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { response: null, request: new Request(request, { body }) };
}
