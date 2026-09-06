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
import type { AuthResult } from "./auth";
import { logger } from "./global-logger";
import { toErrMessage } from "./errors";
import { checkRateLimitViaBinding } from "./rate-limit-binding";

// ============================================================================
// Configuration
// ============================================================================

export interface RateLimitConfig {
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
  "/api/auth/register": {
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: "ratelimit:auth-register",
  },
  "/api/auth/login": {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: "ratelimit:auth-login",
  },
  "/api/auth/refresh": {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: "ratelimit:auth-refresh",
  },
  "/api/nlq": {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: "ratelimit:nlq",
  },
  "/api/experience": {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: "ratelimit:experience",
  },
  "/deals": {
    maxRequests: 60,
    windowSeconds: 60,
    keyPrefix: "ratelimit:deals",
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

const SENSITIVE_ENDPOINTS = new Set([
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

// ============================================================================
// Rate Limiting Functions
// ============================================================================

/**
 * Check if a request should be rate limited.
 *
 * Primary path (ADR-028): the native Workers Rate Limiting binding for
 * standard 60-second endpoint limits — atomic, colo-local counters with no
 * check-then-set race. Fallback path: the original sliding-window KV
 * counter, used for 300s windows, per-key custom limits, deploy surfaces
 * without the bindings, or when a binding call fails.
 *
 * @param env - Worker environment with rate-limit and KV bindings
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

  // Primary path: native binding (60s windows, endpoint defaults only —
  // per-key configs carry arbitrary limits the fixed namespaces can't serve).
  if (!perKeyConfig) {
    try {
      const outcome = await checkRateLimitViaBinding(env, identifier, config);
      if (outcome) {
        // The binding reports only success/failure; Remaining is advisory
        // on this path (see ADR-028). Reset/Retry-After keep window math.
        return outcome.success
          ? {
              allowed: true,
              remaining: config.maxRequests - 1,
              resetTime,
              limit: config.maxRequests,
            }
          : blockedRateLimitResult(config, resetTime);
      }
    } catch (error) {
      logger.error("Rate limit binding check failed", {
        component: "rate-limit",
        endpoint,
        error: toErrMessage(error),
      });
      if (SENSITIVE_ENDPOINTS.has(endpoint)) {
        return blockedRateLimitResult(config, resetTime);
      }
      // Non-sensitive: fall through to the KV path below.
    }
  }

  // Create unique key for this client + endpoint + window
  const key = `${config.keyPrefix}:${identifier}:${windowStart}`;

  // Some local/test deployments intentionally omit the KV binding. This is
  // not a storage failure; preserve the existing no-rate-limit behavior.
  if (!env.DEALS_LOCK) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetTime,
      limit: config.maxRequests,
    };
  }

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
    logger.error("Rate limit check failed", {
      component: "rate-limit",
      error: toErrMessage(error),
    });
    return SENSITIVE_ENDPOINTS.has(endpoint)
      ? blockedRateLimitResult(config, resetTime)
      : {
          allowed: true,
          remaining: config.maxRequests,
          resetTime,
          limit: config.maxRequests,
        };
  }
}

function blockedRateLimitResult(
  config: RateLimitConfig,
  resetTime: number,
): RateLimitResult {
  return {
    allowed: false,
    remaining: 0,
    resetTime,
    limit: config.maxRequests,
  };
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
