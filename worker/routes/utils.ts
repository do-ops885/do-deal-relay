// ============================================================================
// Response Utility Helpers
// ============================================================================

import type { Env } from "../types";

/**
 * Default allowed origins for CORS validation
 */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://do-deal-relay.pages.dev",
  "https://do-deal-relay.com",
  "https://www.do-deal-relay.com",
  "http://localhost:8787",
  "http://localhost:3000",
];

/**
 * Get all allowed origins, including those from environment variables
 */
export function getAllowedOrigins(env?: Env): string[] {
  if (env?.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Centralized security headers for all responses
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; media-src 'self'; object-src 'none'; frame-src 'none';",
};

/**
 * Get allowed origin based on request Origin header and environment
 */
export function getAllowedOrigin(origin?: string | null, env?: Env): string {
  const allowed = getAllowedOrigins(env);
  if (origin && allowed.includes(origin)) {
    return origin;
  }
  return allowed[0]!; // Default to primary production domain
}

/**
 * Create a standardized JSON response with proper security and CORS headers
 */
export function jsonResponse(
  data: unknown,
  status: number = 200,
  request?: Request,
  env?: Env,
): Response {
  const origin = request?.headers.get("Origin");

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(origin, env),
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Correlation-ID, X-Webhook-Signature, MCP-Session-Id",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Create JSON response with specific origin (legacy helper, now uses jsonResponse)
 * @deprecated Use jsonResponse(data, status, request, env) instead
 */
export function jsonResponseWithOrigin(
  data: unknown,
  status: number = 200,
  origin?: string,
  env?: Env,
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(origin, env),
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Correlation-ID, X-Webhook-Signature, MCP-Session-Id",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
      ...SECURITY_HEADERS,
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
  request?: Request,
  env?: Env,
): Response {
  return jsonResponse(
    { error: message, ...(details ? { details } : {}) },
    status,
    request,
    env,
  );
}

/**
 * Create 401 Unauthorized response
 */
export function unauthorizedResponse(
  message: string = "Unauthorized",
  request?: Request,
  env?: Env,
): Response {
  const origin = request?.headers.get("Origin");

  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="api"',
      "Access-Control-Allow-Origin": getAllowedOrigin(origin, env),
      Vary: "Origin",
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Create 403 Forbidden response
 */
export function forbiddenResponse(
  message: string = "Forbidden",
  request?: Request,
  env?: Env,
): Response {
  return errorResponse(message, 403, undefined, request, env);
}

/**
 * Validate a URL for safe redirection
 * Requires HTTPS for production domains, allows HTTP for localhost only
 */
export function validateRedirect(url: string): boolean {
  try {
    // Check for bypass characters before URL parsing
    if (
      url.includes("\\") ||
      url.includes("\x00") ||
      url.includes("\x0d") ||
      url.includes("\x0a")
    ) {
      return false;
    }

    const parsed = new URL(url);
    // Only allow http/https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    // Require HTTPS for production domains
    const isLocalhost = parsed.hostname === "localhost";
    if (!isLocalhost && parsed.protocol !== "https:") {
      return false;
    }

    // Check for userinfo-based bypass (@ in URL)
    if (parsed.username || parsed.password) {
      return false;
    }

    const hostname = parsed.hostname.replace(/^www\./, "");
    const allDomains = [...ALLOWED_REDIRECT_DOMAINS, "localhost"];
    return allDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
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
      const isAllowed = allowedOriginsCheck(hostname, allowedDomains);
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

function allowedOriginsCheck(
  hostname: string,
  allowedDomains: string[],
): boolean {
  return allowedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}
