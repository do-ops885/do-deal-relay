/**
 * Rate Limiting with KV Persistence
 *
 * Implements sliding window rate limiting using Cloudflare KV for
 * distributed state across Workers. Unlike in-memory rate limiting,
 * this persists across worker restarts and works across multiple instances.
 *
 * @module worker/lib/rate-limit-kv
 */

import type { Env } from "../types";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_SECONDS = 60;
const KEY_PREFIX = "rl:kv";

// ============================================================================
// Types
// ============================================================================

export interface RateLimitKVResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Unix timestamp when the current window resets */
  resetAt: Date;
  /** Total requests allowed per window */
  total: number;
}

interface RateLimitKVState {
  client_id: string;
  request_count: number;
  window_start: number;
}

interface RateLimitKVStore {
  get: (key: string, options?: { type?: string }) => Promise<unknown>;
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Create a rate limit KV store from environment.
 *
 * Provides a typed interface for rate limiting operations.
 * Uses DEALS_LOCK namespace by default.
 *
 * @param env - Worker environment with KV bindings
 * @param options - Optional configuration overrides
 * @returns Rate limit store interface
 * @example
 * ```typescript
 * const store = createRateLimitKVStore(env);
 * const result = await store.checkLimit("client-123", 10, 60);
 * ```
 */
export function createRateLimitKVStore(
  env: Env,
  options?: {
    maxRequests?: number;
    windowSeconds?: number;
    keyPrefix?: string;
  },
): RateLimitStore {
  const config = {
    maxRequests: options?.maxRequests ?? DEFAULT_MAX_REQUESTS,
    windowSeconds: options?.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
    keyPrefix: options?.keyPrefix ?? KEY_PREFIX,
  };

  return {
    checkLimit: (
      clientId: string,
      maxRequests: number = config.maxRequests,
      windowSeconds: number = config.windowSeconds,
    ) => checkRateLimitKV(env, clientId, maxRequests, windowSeconds),

    getState: (clientId: string) =>
      getRateLimitKVState(env, clientId, config.windowSeconds),

    reset: (clientId: string) =>
      resetRateLimitKV(env, clientId, config.windowSeconds),

    config,
  };
}

export interface RateLimitStore {
  checkLimit: (
    clientId: string,
    maxRequests?: number,
    windowSeconds?: number,
  ) => Promise<RateLimitKVResult>;
  getState: (clientId: string) => Promise<RateLimitKVState | null>;
  reset: (clientId: string) => Promise<void>;
  config: {
    maxRequests: number;
    windowSeconds: number;
    keyPrefix: string;
  };
}

// ============================================================================
// Core Rate Limiting Functions
// ============================================================================

/**
 * Check rate limit using sliding window algorithm with KV persistence.
 *
 * Implements a sliding window rate limit that tracks individual client
 * request counts within time windows. Uses KV for persistence so limits
 * are maintained across worker restarts.
 *
 * @param env - Worker environment with KV bindings
 * @param clientId - Unique client identifier
 * @param maxRequests - Maximum requests allowed in window (default: 100)
 * @param windowSeconds - Window duration in seconds (default: 60)
 * @returns Rate limit result with remaining quota
 * @example
 * ```typescript
 * const result = await checkRateLimitKV("user-123", 10, 60);
 * if (!result.allowed) {
 *   return new Response("Rate limited", { status: 429 });
 * }
 * console.log(`Remaining: ${result.remaining}`);
 * ```
 */
export async function checkRateLimitKV(
  env: Env,
  clientId: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<RateLimitKVResult> {
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const windowEnd = new Date((windowStart + windowSeconds) * 1000);
  const key = `${KEY_PREFIX}:${clientId}`;

  // Handle edge case: if maxRequests is 0, always block
  if (maxRequests <= 0) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: windowEnd,
      total: 0,
    };
  }

  try {
    // Get current state from KV
    const state = await env.DEALS_LOCK.get<RateLimitKVState>(key, "json");

    // If no state or window has expired, start fresh
    if (!state || state.window_start !== windowStart) {
      // Create new state
      const newState: RateLimitKVState = {
        client_id: clientId,
        request_count: 1,
        window_start: windowStart,
      };

      await env.DEALS_LOCK.put(key, JSON.stringify(newState), {
        expirationTtl: windowSeconds * 2, // Keep slightly longer than window
      });

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: windowEnd,
        total: maxRequests,
      };
    }

    // Window is still active, check count (allow if request_count < maxRequests)
    if (state.request_count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        total: maxRequests,
      };
    }

    // Increment count
    state.request_count += 1;
    await env.DEALS_LOCK.put(key, JSON.stringify(state), {
      expirationTtl: windowSeconds * 2,
    });

    return {
      allowed: true,
      remaining: maxRequests - state.request_count,
      resetAt: windowEnd,
      total: maxRequests,
    };
  } catch (error) {
    // Fail open on KV errors
    console.error("Rate limit KV check failed:", error);
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: windowEnd,
      total: maxRequests,
    };
  }
}

/**
 * Get current rate limit state for a client.
 *
 * Returns the stored state including request count and window info.
 * Useful for debugging and admin operations.
 *
 * @param env - Worker environment
 * @param clientId - Client identifier
 * @param windowSeconds - Window size in seconds
 * @returns Current rate limit state or null if not found
 */
export async function getRateLimitKVState(
  env: Env,
  clientId: string,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<RateLimitKVState | null> {
  const now = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const key = `${KEY_PREFIX}:${clientId}`;

  try {
    const state = await env.DEALS_LOCK.get<RateLimitKVState>(key, "json");

    // Return null if not found or window expired
    if (!state || state.window_start !== now) {
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * Reset rate limit for a specific client.
 *
 * Removes the rate limit state from KV, allowing the client
 * to start with a fresh counter. Useful for admin operations
 * or testing.
 *
 * @param env - Worker environment
 * @param clientId - Client identifier
 * @param windowSeconds - Window size in seconds
 */
export async function resetRateLimitKV(
  env: Env,
  clientId: string,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<void> {
  const key = `${KEY_PREFIX}:${clientId}`;
  await env.DEALS_LOCK.delete(key);
}

/**
 * Get all active rate limit entries.
 *
 * Scans KV for all rate limit keys. Use with caution on
 * large datasets - this is mainly for admin/debugging.
 *
 * @param env - Worker environment
 * @returns Map of client IDs to their rate limit states
 */
export async function getAllRateLimitStates(
  env: Env,
): Promise<Map<string, RateLimitKVState>> {
  const states = new Map<string, RateLimitKVState>();

  try {
    const list = await env.DEALS_LOCK.list({ prefix: `${KEY_PREFIX}:` });

    for (const key of list.keys) {
      const state = await env.DEALS_LOCK.get<RateLimitKVState>(
        key.name,
        "json",
      );
      if (state) {
        const clientId = key.name.replace(`${KEY_PREFIX}:`, "");
        states.set(clientId, state);
      }
    }
  } catch (error) {
    console.error("Failed to list rate limit states:", error);
  }

  return states;
}

/**
 * Middleware factory for KV-based rate limiting.
 *
 * Creates a middleware function that wraps handlers with
 * rate limiting. Returns 429 when limit exceeded.
 *
 * @param env - Worker environment
 * @param options - Rate limit configuration
 * @returns Middleware function
 * @example
 * ```typescript
 * const rateLimiter = createRateLimitKVMiddleware(env, { maxRequests: 10, windowSeconds: 60 });
 * app.use("/api/submit", rateLimiter);
 * ```
 */
export function createRateLimitKVMiddleware(
  env: Env,
  options?: {
    maxRequests?: number;
    windowSeconds?: number;
    getClientId?: (request: Request) => string;
  },
) {
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowSeconds = options?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const getClientId =
    options?.getClientId ??
    ((r) => r.headers.get("CF-Connecting-IP") ?? "unknown");

  return async (
    request: Request,
    handler: () => Promise<Response>,
  ): Promise<Response> => {
    const clientId = getClientId(request);
    const result = await checkRateLimitKV(
      env,
      clientId,
      maxRequests,
      windowSeconds,
    );

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retry_after: Math.ceil(
            (result.resetAt.getTime() - Date.now()) / 1000,
          ),
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": result.total.toString(),
            "X-RateLimit-Remaining": result.remaining.toString(),
            "X-RateLimit-Reset": result.resetAt.toISOString(),
            "Retry-After": Math.ceil(
              (result.resetAt.getTime() - Date.now()) / 1000,
            ).toString(),
          },
        },
      );
    }

    const response = await handler();
    response.headers.set("X-RateLimit-Limit", result.total.toString());
    response.headers.set("X-RateLimit-Remaining", result.remaining.toString());
    response.headers.set("X-RateLimit-Reset", result.resetAt.toISOString());

    return response;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Batch check rate limits for multiple clients.
 *
 * Optimized for checking multiple clients in a single operation.
 * Useful for admin panels or bulk operations.
 *
 * @param env - Worker environment
 * @param clientIds - Array of client identifiers
 * @param maxRequests - Max requests per window
 * @param windowSeconds - Window size in seconds
 * @returns Map of client ID to rate limit result
 */
export async function batchCheckRateLimitKV(
  env: Env,
  clientIds: string[],
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<Map<string, RateLimitKVResult>> {
  const results = new Map<string, RateLimitKVResult>();

  // Process in parallel for efficiency
  await Promise.all(
    clientIds.map(async (clientId) => {
      const result = await checkRateLimitKV(
        env,
        clientId,
        maxRequests,
        windowSeconds,
      );
      results.set(clientId, result);
    }),
  );

  return results;
}

/**
 * Get rate limit statistics.
 *
 * Provides aggregate statistics for monitoring and alerting.
 *
 * @param env - Worker environment
 * @returns Statistics about rate limit usage
 */
export async function getRateLimitStats(env: Env): Promise<{
  activeClients: number;
  rateLimitedClients: number;
  avgRequestsPerClient: number;
}> {
  const states = await getAllRateLimitStates(env);

  let totalRequests = 0;
  let rateLimited = 0;

  for (const state of states.values()) {
    totalRequests += state.request_count;
    if (state.request_count >= DEFAULT_MAX_REQUESTS) {
      rateLimited++;
    }
  }

  return {
    activeClients: states.size,
    rateLimitedClients: rateLimited,
    avgRequestsPerClient: states.size > 0 ? totalRequests / states.size : 0,
  };
}
