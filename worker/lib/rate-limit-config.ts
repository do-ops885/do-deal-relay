/**
 * Rate Limit Configuration
 *
 * Endpoint limit table and per-key config helpers extracted from
 * `worker/lib/rate-limit.ts` to keep both modules under the
 * `MAX_LINES_PER_SOURCE_FILE=500` limit. Zero behavior change.
 *
 * @module worker/lib/rate-limit-config
 */

import type { AuthResult } from "./auth";

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
}

export const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: "ratelimit",
};

function cfg(
  maxRequests: number,
  keySuffix: string,
  windowSeconds = 60,
): RateLimitConfig {
  return { maxRequests, windowSeconds, keyPrefix: "ratelimit:" + keySuffix };
}

export const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  "/api/submit": cfg(10, "submit"),
  "/api/discover": cfg(5, "discover", 300),
  "/api/research": cfg(20, "research"),
  "/api/email/incoming": cfg(30, "email"),
  "/api/email/parse": cfg(20, "email-parse"),
  "/api/validate/url": cfg(20, "validate"),
  "/api/validate/batch": cfg(5, "validate-batch", 300),
  "/api/semantic-search": cfg(10, "semantic"),
  "/api/auth/register": cfg(5, "auth-register"),
  "/api/auth/login": cfg(10, "auth-login"),
  "/api/auth/refresh": cfg(20, "auth-refresh"),
  "/api/nlq": cfg(10, "nlq"),
  "/api/experience": cfg(20, "experience"),
  "/deals": cfg(60, "deals"),
  "/webhooks/incoming": cfg(50, "webhook"),
  default: DEFAULT_CONFIG,
};

export const SENSITIVE_ENDPOINTS = new Set([
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/submit",
  "/api/email/incoming",
  "/api/email/parse",
  "/api/validate/url",
  "/api/validate/batch",
  "/webhooks/incoming",
]);

/** Parse per-key rate limit config from AuthResult metadata. */
export function getPerKeyRateLimitConfig(
  auth: AuthResult,
): RateLimitConfig | undefined {
  if (!auth.requestsPerMinute && !auth.requestsPerHour) return undefined;
  return {
    maxRequests: auth.requestsPerMinute ?? DEFAULT_CONFIG.maxRequests,
    windowSeconds: 60,
    keyPrefix: "ratelimit:user",
  };
}

/** Get rate limit configuration for an endpoint. */
export function getRateLimitConfig(endpoint: string): RateLimitConfig {
  return ENDPOINT_LIMITS[endpoint] ?? DEFAULT_CONFIG;
}
