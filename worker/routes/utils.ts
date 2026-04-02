export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      // CORS headers - restrict in production
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Access-Control-Allow-Credentials": "true",
      // Security headers
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

/**
 * Get allowed origin based on environment
 * Production: Restrict to known domains
 * Development: Allow localhost
 */
function getAllowedOrigin(): string {
  // In production, this should check against allowed domains
  // For now, return specific origin or use request origin in actual implementation
  const allowedOrigins = [
    "https://do-deal-relay.pages.dev",
    "https://do-deal-relay.com",
    "http://localhost:8787",
    "http://localhost:3000",
  ];

  // Return first allowed origin as default
  // In actual implementation, validate against request origin
  return allowedOrigins[0] || "*";
}

/**
 * Create JSON response with specific origin (for authenticated endpoints)
 */
export function jsonResponseWithOrigin(
  data: unknown,
  status: number = 200,
  origin?: string,
): Response {
  const allowedOrigins = [
    "https://do-deal-relay.pages.dev",
    "https://do-deal-relay.com",
    "http://localhost:8787",
    "http://localhost:3000",
  ];

  const safeOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": safeOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Access-Control-Allow-Credentials": "true",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

/**
 * Create error response with proper security headers
 */
export function errorResponse(
  message: string,
  status: number = 400,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(
    { error: message, ...(details ? { details } : {}) },
    status,
  );
}

/**
 * Create 401 Unauthorized response
 */
export function unauthorizedResponse(
  message: string = "Unauthorized",
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="api"',
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

/**
 * Create 403 Forbidden response
 */
export function forbiddenResponse(message: string = "Forbidden"): Response {
  return errorResponse(message, 403);
}

/**
 * Validate URL to prevent open redirects
 * Returns null if URL is invalid or potentially dangerous
 */
export function validateUrl(
  url: string,
  allowedDomains?: string[],
): string | null {
  try {
    const parsed = new URL(url);

    // Must be HTTPS (except localhost)
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return null;
    }

    // Check for URL-encoded characters that might be used for bypasses
    if (
      url.includes("\\") ||
      url.includes("\x00") ||
      url.includes("\x0d") ||
      url.includes("\x0a")
    ) {
      return null;
    }

    // If allowed domains specified, validate against them
    if (allowedDomains && allowedDomains.length > 0) {
      const hostname = parsed.hostname.replace(/^www\./, "");
      const isAllowed = allowedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      );
      if (!isAllowed) {
        return null;
      }
    }

    // Check for common redirect bypasses
    const dangerousPatterns = [
      /\/\/+/g, // Multiple slashes
      /\.\./g, // Path traversal
      /^\/\//, // Protocol-relative
      /@/, // Userinfo in URL
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(url)) {
        return null;
      }
    }

    return url;
  } catch {
    return null;
  }
}
