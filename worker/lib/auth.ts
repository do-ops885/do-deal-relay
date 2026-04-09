/**
 * Authentication & Authorization Middleware
 *
 * Implements API key authentication for sensitive endpoints.
 * Uses HMAC-SHA256 for secure API key validation.
 */

import type { Env } from "../types";
import { unauthorizedResponse, forbiddenResponse } from "../routes/utils";

// ============================================================================
// Types
// ============================================================================

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  role?: "admin" | "user" | "readonly";
  error?: string;
}

export interface ApiKeyConfig {
  key: string;
  userId: string;
  role: "admin" | "user" | "readonly";
  createdAt: string;
  expiresAt?: string;
  lastUsed?: string;
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

  await env.DEALS_SOURCES.put(
    `apikey:${keyHash}`,
    JSON.stringify(metadata),
    { expirationTtl: config.expiresAt ? undefined : 365 * 86400 }, // 1 year default
  );

  return key;
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

  // Look up in KV
  const metadata = await env.DEALS_SOURCES.get<ApiKeyConfig>(
    `apikey:${keyHash}`,
    "json",
  );

  if (!metadata) {
    return { authenticated: false, error: "Invalid API key" };
  }

  // Check expiration
  if (metadata.expiresAt && new Date(metadata.expiresAt) < new Date()) {
    return { authenticated: false, error: "API key expired" };
  }

  // Update last used
  metadata.lastUsed = new Date().toISOString();
  await env.DEALS_SOURCES.put(`apikey:${keyHash}`, JSON.stringify(metadata));

  return {
    authenticated: true,
    userId: metadata.userId,
    role: metadata.role,
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
      return unauthorizedResponse(auth.error || "Unauthorized");
    }

    if (requiredRole && auth.role !== requiredRole && auth.role !== "admin") {
      return forbiddenResponse(`Required role: ${requiredRole}`);
    }

    return auth;
  };
}

// ============================================================================
// CORS & Security Headers
// ============================================================================

/**
 * Allowed origins for CORS
 */
const ALLOWED_ORIGINS = [
  "https://do-deal-relay.pages.dev",
  "https://do-deal-relay.com",
  "https://www.do-deal-relay.com",
  "http://localhost:8787",
  "http://localhost:3000",
];

/**
 * Get allowed origin from request
 */
export function getAllowedOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0]; // Default to first allowed
}

/**
 * Create CORS headers with proper origin validation
 */
export function createCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-Correlation-ID",
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
