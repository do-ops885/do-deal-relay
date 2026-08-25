/**
 * Authentication & Authorization Middleware
 *
 * Implements API key authentication for sensitive endpoints.
 * Uses HMAC-SHA256 for secure API key validation.
 */

import type { Env } from "../types";
import {
  getAllowedOrigin,
  unauthorizedResponse,
  forbiddenResponse,
} from "../routes/utils";
import { checkRateLimit, createRateLimitHeaders } from "./rate-limit";
import { verifyToken } from "./jwt";
import { listAllKvKeys } from "./kv-pagination";

const JWT_ROLES: AuthRole[] = ["admin", "user", "readonly", "viewer"];

export { getAllowedOrigin };

// ============================================================================
// Types
// ============================================================================

export type AuthRole =
  "admin" | "user" | "readonly" | "viewer" | "api_consumer";

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  role?: AuthRole;
  email?: string;
  error?: string;
  requestsPerMinute?: number;
  requestsPerHour?: number;
}

export interface ApiKeyConfig {
  key: string;
  userId: string;
  role: "admin" | "user" | "readonly";
  createdAt: string;
  expiresAt?: string;
  lastUsed?: string;
  keyHash?: string;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Hash API key for storage (never store plaintext)
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a new API key
 * Format: ddr_<random32chars>_<timestamp>
 */
export function generateApiKey(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const random = Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const timestamp = Math.floor(Date.now() / 1000);
  return `ddr_${random}_${timestamp}`;
}

/**
 * Store API key metadata in KV
 */
export async function storeApiKey(
  env: Env,
  config: ApiKeyConfig,
): Promise<string> {
  const key = generateApiKey();
  const keyHash = await hashApiKey(key);

  const metadata = {
    ...config,
    keyHash, // Store hash, not plaintext
  };

  const kv = env.WEBHOOK_API_KEYS || env.DEALS_SOURCES;
  await kv.put(`apikey:${keyHash}`, JSON.stringify(metadata), {
    expiration: config.expiresAt
      ? Math.floor(new Date(config.expiresAt).getTime() / 1000)
      : undefined,
    expirationTtl: config.expiresAt ? undefined : 365 * 86400, // 1 year default
  });

  return key;
}

/**
 * List all API keys stored in KV
 */
export async function listApiKeys(env: Env): Promise<ApiKeyConfig[]> {
  const kv = env.WEBHOOK_API_KEYS || env.DEALS_SOURCES;
  const list = await listAllKvKeys(kv, { prefix: "apikey:" });

  const results = await Promise.all(
    list.keys.map(async (key) => {
      const raw = await kv.get(key.name, "json");
      return raw as ApiKeyConfig | null;
    }),
  );

  return results.filter((r): r is ApiKeyConfig => r !== null);
}

/**
 * Revoke an API key by its hash
 */
export async function revokeApiKey(
  env: Env,
  keyHash: string,
): Promise<boolean> {
  const kv = env.WEBHOOK_API_KEYS || env.DEALS_SOURCES;
  const key = keyHash.startsWith("apikey:") ? keyHash : `apikey:${keyHash}`;
  const existing = await kv.get(key);
  if (!existing) return false;

  await kv.delete(key);
  return true;
}

/**
 * Verify API key from request
 */
export async function verifyApiKey(
  env: Env,
  apiKey: string,
): Promise<AuthResult> {
  // Check format
  if (!apiKey.startsWith("ddr_")) {
    return { authenticated: false, error: "Invalid API key format" };
  }

  // Hash the provided key
  const keyHash = await hashApiKey(apiKey);

  const normalizeMetadata = (value: unknown): ApiKeyConfig | null => {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as ApiKeyConfig;
      } catch {
        return null;
      }
    }
    return value as ApiKeyConfig;
  };

  // Try WEBHOOK_API_KEYS first, fallback to DEALS_SOURCES
  let metadata: ApiKeyConfig | null = null;
  if (env.WEBHOOK_API_KEYS) {
    const raw = await env.WEBHOOK_API_KEYS.get<ApiKeyConfig | string>(
      `apikey:${keyHash}`,
      "json",
    );
    metadata = normalizeMetadata(raw);
  }

  if (!metadata) {
    const raw = await env.DEALS_SOURCES.get<ApiKeyConfig | string>(
      `apikey:${keyHash}`,
      "json",
    );
    metadata = normalizeMetadata(raw);
  }

  if (!metadata) {
    return { authenticated: false, error: "Invalid API key" };
  }

  // Check expiration
  if (metadata.expiresAt && new Date(metadata.expiresAt) < new Date()) {
    return { authenticated: false, error: "API key expired" };
  }

  // Update last used
  metadata.lastUsed = new Date().toISOString();
  const kv = env.WEBHOOK_API_KEYS || env.DEALS_SOURCES;
  await kv.put(`apikey:${keyHash}`, JSON.stringify(metadata));

  return {
    authenticated: true,
    userId: metadata.userId,
    role: metadata.role,
    requestsPerMinute: metadata.rateLimit?.requestsPerMinute,
    requestsPerHour: metadata.rateLimit?.requestsPerHour,
  };
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * Extract API key from request headers
 */
export function extractApiKey(request: Request): string | null {
  // Try Authorization header (Bearer token)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Try X-API-Key header
  const apiKeyHeader = request.headers.get("X-API-Key");
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Authenticate request middleware
 *
 * Usage:
 * ```typescript
 * const auth = await authenticateRequest(request, env);
 * if (!auth.authenticated) {
 *   return unauthorizedResponse(auth.error || "Unauthorized");
 * }
 * ```
 */
export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthResult> {
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return { authenticated: false, error: "Missing API key" };
  }

  // JWT Bearer tokens are not API keys (no ddr_ prefix) and carry 3 dot-separated
  // segments. Verify them via the worker's HMAC JWT verifier.
  if (!apiKey.startsWith("ddr_") && apiKey.split(".").length === 3) {
    const payload = await verifyToken(apiKey, env.JWT_SECRET ?? "");
    if (!payload) {
      return { authenticated: false, error: "Invalid JWT token" };
    }
    const role = JWT_ROLES.includes(payload.role as AuthRole)
      ? (payload.role as AuthRole)
      : "user";
    return {
      authenticated: true,
      userId: typeof payload.sub === "string" ? payload.sub : undefined,
      role,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  }

  return await verifyApiKey(env, apiKey);
}

/**
 * Require authentication middleware factory
 */
export function requireAuth(
  env: Env,
  requiredRole?: "admin" | "user" | "readonly",
) {
  return async (request: Request): Promise<AuthResult | Response> => {
    const auth = await authenticateRequest(request, env);

    if (!auth.authenticated) {
      return unauthorizedResponse(auth.error || "Unauthorized", request);
    }

    if (requiredRole && auth.role !== requiredRole && auth.role !== "admin") {
      return forbiddenResponse(`Required role: ${requiredRole}`, request);
    }

    return auth;
  };
}

/**
 * Higher-order helper for inline authentication in route handlers
 */
export async function withAuth(
  request: Request,
  env: Env,
  requiredRole: "admin" | "user" | "readonly" | undefined,
  handler: (auth: AuthResult) => Promise<Response>,
): Promise<Response> {
  const middleware = requireAuth(env, requiredRole);
  const auth = await middleware(request);

  if (auth instanceof Response) {
    return auth;
  }

  if (auth.requestsPerMinute || auth.requestsPerHour) {
    const identifier = auth.userId || "unknown";
    const endpoint = new URL(request.url).pathname;
    const perKeyConfig = auth.requestsPerMinute
      ? {
          maxRequests: auth.requestsPerMinute,
          windowSeconds: 60,
          keyPrefix: `ratelimit:${identifier}`,
        }
      : undefined;
    const rateLimitResult = await checkRateLimit(
      env,
      identifier,
      endpoint,
      perKeyConfig,
    );
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil(
        rateLimitResult.resetTime - Date.now() / 1000,
      );
      const headers = createRateLimitHeaders(rateLimitResult);
      headers.set("Content-Type", "application/json");
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter,
        }),
        {
          status: 429,
          headers: Object.fromEntries(headers),
        },
      );
    }
  }

  return handler(auth);
}

// ============================================================================
// CORS & Security Headers
// ============================================================================

/**
 * Create CORS headers with proper origin validation
 */
export function createCorsHeaders(
  request: Request,
  env?: Env,
): Record<string, string> {
  const origin = request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(origin, env),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-Correlation-ID, X-Webhook-Signature, MCP-Session-Id",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Create security headers for all responses
 */
export function createSecurityHeaders(): Record<string, string> {
  return {
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
}
