// ============================================================================
// Response Utility Helpers
// ============================================================================

import type { Env } from "../types";
import { hasDangerousChars } from "../lib/security";

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
 * Get all allowed origins, including those from environment variables.
 * Localhost entries are stripped in production to avoid trusting
 * credentialed localhost origins against production.
 */
export function getAllowedOrigins(env?: Env): string[] {
  if (env?.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  }
  const isProduction = env?.ENVIRONMENT === "production";
  if (isProduction) {
    return DEFAULT_ALLOWED_ORIGINS.filter(
      (o) => !o.includes("localhost") && !o.includes("127.0.0.1"),
    );
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
  return ""; // Return empty string if origin not allowed (prevents wildcard bypass)
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

    // Check for common redirect bypasses in the remaining URL string (after protocol)
    const protocolPrefix = parsed.protocol + "//";
    if (!url.startsWith(protocolPrefix)) {
      return null;
    }
    const urlWithoutProtocol = url.slice(protocolPrefix.length);

    const dangerousPatterns = [
      /\/\/+/g, // Multiple slashes
      /\.\./g, // Path traversal
      /^\/\//, // Protocol-relative
      /@/, // Userinfo in URL
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(urlWithoutProtocol)) {
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

/**
 * Intent-revealing alias for redirect validation (issue #912).
 * Original validateUrl (string|null) kept for compatibility.
 */
export function validateRedirectUrl(
  url: string,
  allowedDomains?: string[],
): string | null {
  return validateUrl(url, allowedDomains);
}

// hasDangerousChars is shared from worker/lib/security.ts (issue #912).
// Re-exported here for importers that referenced the local copy.
export { hasDangerousChars };

/**
 * Allowed domains for redirects
 */
export const ALLOWED_REDIRECT_DOMAINS = [
  "do-deal-relay.com",
  "do-deal-relay.pages.dev",
  "localhost",
];

/**
 * Validate redirect URL to prevent open redirects and SSRF bypasses.
 * Rejects control characters, encoded bypasses, path traversal, userinfo, and multiple slashes.
 */
export function validateRedirect(url: string): boolean {
  try {
    // 1. Block dangerous characters (CRLF, backslashes, null bytes, etc.)
    if (hasDangerousChars(url)) {
      return false;
    }

    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");

    // 2. Allow localhost only if protocol is http or https
    if (hostname === "localhost") {
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    }

    // 3. Must be HTTPS for production domains
    if (parsed.protocol !== "https:") {
      return false;
    }

    // 4. Ensure we have a valid protocol prefix start to avoid protocol-relative or relative bypasses
    const protocolPrefix = parsed.protocol + "//";
    if (!url.startsWith(protocolPrefix)) {
      return false;
    }

    // 5. Check for common open redirect bypasses (multiple slashes, path traversal, userinfo)
    const urlWithoutProtocol = url.slice(protocolPrefix.length);
    const dangerousPatterns = [
      /\/{2,}/, // Multiple slashes (e.g. //attacker.com)
      /\.\./, // Path traversal (e.g. /../)
      /^\/\//, // Protocol-relative at the start of remainder
      /@/, // Userinfo in URL (e.g. user:pass@domain.com)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(urlWithoutProtocol)) {
        return false;
      }
    }

    return ALLOWED_REDIRECT_DOMAINS.includes(hostname);
  } catch {
    return false;
  }
}
