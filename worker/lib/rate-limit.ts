/**
 * Rate Limiting Module
 *
 * Implements token bucket rate limiting for API endpoints.
 * Uses Cloudflare KV for distributed rate limit state across Workers.
 *
 * Rate limits are defined per endpoint and can be configured
 * via environment variables. Supports both IP-based and
 * API key-based rate limiting.
 *
 * @module worker/lib/rate-limit
 */

import type { Env } from "../types";
import type { AuthResult, ApiKeyConfig } from "./auth";
import { hashApiKey } from "./auth";
import { logger } from "./global-logger";

// ============================================================================
// Configuration
// ============================================================================

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Key prefix for KV storage */
  keyPrefix: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: "ratelimit",
};

// Endpoint-specific rate limits
const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  "/api/submit": {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: "ratelimit:submit",
  },
  "/api/discover": {
    maxRequests: 5,
    windowSeconds: 300, // 5 minutes - expensive operation
    keyPrefix: "ratelimit:discover",
  },
  "/api/research": {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: "ratelimit:research",
  },
  "/api/email/incoming": {
    maxRequests: 30,
    windowSeconds: 60,
    keyPrefix: "ratelimit:email",
  },
  "/api/email/parse": {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: "ratelimit:email-parse",
  },
  "/api/validate/url": {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: "ratelimit:validate",
  },
  "/api/validate/batch": {
    maxRequests: 5,
    windowSeconds: 300,
    keyPrefix: "ratelimit:validate-batch",
  },
  "/api/semantic-search": {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: "ratelimit:semantic",
  },
  "/webhooks/incoming": {
    maxRequests: 50,
    windowSeconds: 60,
    keyPrefix: "ratelimit:webhook",
  },
  default: DEFAULT_CONFIG,
};

// ============================================================================
// Types
// ============================================================================

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Unix timestamp when the current window resets */
  resetTime: number;
  /** Total requests allowed per window */
  limit: number;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

// ============================================================================
// Rate Limiting Functions
// ============================================================================

/**
 * Check if a request should be rate limited.
 *
 * Implements a sliding window rate limit algorithm using KV storage.
 * Each client (identified by IP or API key) gets their own counter
 * within a time window.
 *
 * @param env - Worker environment with KV bindings
 * @param identifier - Unique client identifier (IP or API key)
 * @param endpoint - API endpoint being accessed
 * @returns Rate limit check result with remaining quota
 * @example
 * ```typescript
 * const result = await checkRateLimit(env, clientIP, "/api/submit");
 * if (!result.allowed) {
 *   return new Response("Rate limited", { status: 429 });
 * }
 * ```
 */
export async function checkRateLimit(
  env: Env,
  identifier: string,
  endpoint: string,
  perKeyConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
  const config = perKeyConfig ?? ENDPOINT_LIMITS[endpoint] ?? DEFAULT_CONFIG;
  const now = Math.floor(Date.now() / 1000);
  const windowStart =
    Math.floor(now / config.windowSeconds) * config.windowSeconds;
  const resetTime = windowStart + config.windowSeconds;

  // Create unique key for this client + endpoint + window
  const key = `${config.keyPrefix}:${identifier}:${windowStart}`;

  try {
    // Get current count from KV
    const state = await env.DEALS_LOCK.get<RateLimitState>(key, "json");
    const currentCount = state?.count || 0;

    // Check if limit exceeded
    if (currentCount >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        limit: config.maxRequests,
      };
    }

    // Increment counter
    const newCount = currentCount + 1;
    await env.DEALS_LOCK.put(
      key,
      JSON.stringify({ count: newCount, windowStart }),
      { expirationTtl: config.windowSeconds },
    );

    return {
      allowed: true,
      remaining: config.maxRequests - newCount,
      resetTime,
      limit: config.maxRequests,
    };
  } catch (error) {
    // If KV fails, allow the request (fail open)
    logger.error("Rate limit check failed", {
      component: "rate-limit",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetTime,
      limit: config.maxRequests,
    };
  }
}

/**
 * Extract client identifier from request.
 *
 * Tries to use authenticated user/key ID first, then falls back to IP address.
 * This allows authenticated users to have separate rate limits from
 * anonymous users.
 *
 * @param request - HTTP request object
 * @param auth - Optional authentication result
 * @returns Client identifier string
 */
export async function getClientIdentifier(
  request: Request,
  auth?: AuthResult,
): Promise<string> {
  // If authenticated, use a hash of the API key or userId
  if (auth?.authenticated && auth.userId) {
    return `user:${auth.userId}`;
  }

  // Fallback to IP address for reliable identification.
  const forwarded = request.headers.get("CF-Connecting-IP");
  const ip = forwarded || "unknown";

  return `ip:${ip}`;
}

/**
 * Create rate limit headers for HTTP response.
 *
 * Returns standard rate limit headers that clients can use to
 * understand their current quota status.
 *
 * @param result - Rate limit check result
 * @returns Headers object with rate limit information
 * @example
 * ```typescript
 * const result = await checkRateLimit(env, clientId, endpoint);
 * const headers = createRateLimitHeaders(result);
 * return new Response(data, { headers });
 * ```
 */
export function createRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  headers.set("X-RateLimit-Limit", result.limit.toString());
  headers.set(
    "X-RateLimit-Remaining",
    Math.max(0, result.remaining).toString(),
  );
  headers.set("X-RateLimit-Reset", result.resetTime.toString());

  if (!result.allowed) {
    headers.set(
      "Retry-After",
      (result.resetTime - Math.floor(Date.now() / 1000)).toString(),
    );
  }

  return headers;
}

/**
 * Rate limiting middleware factory.
 *
 * Creates a middleware function that can be used to wrap route handlers
 * with rate limiting. Returns 429 Too Many Requests if limit exceeded.
 *
 * @param env - Worker environment
 * @param endpoint - Endpoint identifier for rate limit config
 * @returns Middleware function
 * @example
 * ```typescript
 * const rateLimiter = createRateLimitMiddleware(env, "/api/submit");
 * const response = await rateLimiter(request, () => handleSubmit(body, env));
 * ```
 */
export function createRateLimitMiddleware(
  env: Env,
  endpoint: string,
  auth?: AuthResult,
): (request: Request, handler: () => Promise<Response>) => Promise<Response> {
  return async (
    request: Request,
    handler: () => Promise<Response>,
  ): Promise<Response> => {
    const clientId = await getClientIdentifier(request, auth);
    const perKeyConfig = auth?.authenticated
      ? getPerKeyRateLimitConfig(auth)
      : undefined;
    const result = await checkRateLimit(env, clientId, endpoint, perKeyConfig);

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retry_after: result.resetTime - Math.floor(Date.now() / 1000),
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...Object.fromEntries(createRateLimitHeaders(result)),
          },
        },
      );
    }

    // Execute the handler and add rate limit headers to response
    const response = await handler();

    // Add rate limit headers to successful response
    const headers = createRateLimitHeaders(result);
    headers.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  };
}

// ============================================================================
// Per-Key Rate Limit Configuration
// ============================================================================

/**
 * Get rate limit config from authenticated user's API key metadata.
 * Falls back to endpoint defaults if no per-key config is stored.
 */
export function getPerKeyRateLimitConfig(
  auth: AuthResult,
): RateLimitConfig | undefined {
  if (!auth.requestsPerMinute && !auth.requestsPerHour) {
    return undefined;
  }
  return {
    maxRequests: auth.requestsPerMinute ?? DEFAULT_CONFIG.maxRequests,
    windowSeconds: 60,
    keyPrefix: "ratelimit:user",
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get rate limit configuration for an endpoint.
 *
 * @param endpoint - API endpoint path
 * @returns Rate limit configuration
 */
export function getRateLimitConfig(endpoint: string): RateLimitConfig {
  return ENDPOINT_LIMITS[endpoint] ?? DEFAULT_CONFIG;
}

/**
 * Reset rate limit for a specific client.
 *
 * Useful for testing or manual reset operations.
 *
 * @param env - Worker environment
 * @param identifier - Client identifier
 * @param endpoint - Endpoint to reset
 */
export async function resetRateLimit(
  env: Env,
  identifier: string,
  endpoint: string,
): Promise<void> {
  const config = ENDPOINT_LIMITS[endpoint] ?? DEFAULT_CONFIG;
  const now = Math.floor(Date.now() / 1000);
  const windowStart =
    Math.floor(now / config.windowSeconds) * config.windowSeconds;
  const key = `${config.keyPrefix}:${identifier}:${windowStart}`;

  await env.DEALS_LOCK.delete(key);
}
