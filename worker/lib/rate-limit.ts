/**
 * Rate Limiting Module
 *
 * Primary enforcement: Workers Rate Limiting bindings (ADR-028).
 * Fallback & KV store: Cloudflare KV sliding-window counter.
 *
 * @module worker/lib/rate-limit
 */

import type { Env } from "../types";
import type { AuthResult } from "./auth";
import { logger } from "./global-logger";
import { toErrMessage } from "./errors";
import { checkRateLimitViaBinding } from "./rate-limit-binding";
import {
  DEFAULT_CONFIG,
  ENDPOINT_LIMITS,
  SENSITIVE_ENDPOINTS,
  getPerKeyRateLimitConfig,
} from "./rate-limit-config";
import type { RateLimitConfig } from "./rate-limit-config";

export type { RateLimitConfig } from "./rate-limit-config";
export {
  DEFAULT_CONFIG,
  ENDPOINT_LIMITS,
  SENSITIVE_ENDPOINTS,
  getPerKeyRateLimitConfig,
  getRateLimitConfig,
} from "./rate-limit-config";

// KV-backed subsystem lives in ./rate-limit-kv.ts; re-exported here so
// existing consumers (incl. tests) keep importing from this module.
export type {
  RateLimitKVResult,
  RateLimitKVState,
  RateLimitStore,
} from "./rate-limit-kv";
export {
  checkRateLimitKV,
  getRateLimitKVState,
  resetRateLimitKV,
  getAllRateLimitStates,
  createRateLimitKVStore,
  batchCheckRateLimitKV,
  getRateLimitStats,
  createRateLimitKVMiddleware,
} from "./rate-limit-kv";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

/**
 * Check rate limit via binding (primary) or KV (fallback).
 * @param env Worker environment bindings
 * @param id Client or key identifier string
 * @param endpoint Endpoint identifier string
 * @param perKeyConfig Optional custom rate limit configuration override
 * @returns Rate limit check result
 */
export async function checkRateLimit(
  env: Env,
  id: string,
  endpoint: string,
  perKeyConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
  const config = perKeyConfig ?? ENDPOINT_LIMITS[endpoint] ?? DEFAULT_CONFIG;
  const now = Math.floor(Date.now() / 1000);
  const windowStart =
    Math.floor(now / config.windowSeconds) * config.windowSeconds;
  const resetTime = windowStart + config.windowSeconds;
  const max = config.maxRequests;

  if (!perKeyConfig) {
    try {
      const outcome = await checkRateLimitViaBinding(env, id, config);
      if (outcome) {
        return outcome.success
          ? { allowed: true, remaining: max - 1, resetTime, limit: max }
          : { allowed: false, remaining: 0, resetTime, limit: max };
      }
    } catch (error) {
      logger.error("Rate limit binding check failed", {
        component: "rate-limit",
        endpoint,
        error: toErrMessage(error),
      });
      if (SENSITIVE_ENDPOINTS.has(endpoint)) {
        return { allowed: false, remaining: 0, resetTime, limit: max };
      }
    }
  }

  const key = `${config.keyPrefix}:${id}:${windowStart}`;
  if (!env.DEALS_LOCK) {
    return { allowed: true, remaining: max, resetTime, limit: max };
  }

  try {
    const state = await env.DEALS_LOCK.get<RateLimitState>(key, "json");
    const currentCount = state?.count || 0;
    if (currentCount >= max) {
      return { allowed: false, remaining: 0, resetTime, limit: max };
    }

    const newCount = currentCount + 1;
    await env.DEALS_LOCK.put(
      key,
      JSON.stringify({ count: newCount, windowStart }),
      { expirationTtl: config.windowSeconds },
    );
    return { allowed: true, remaining: max - newCount, resetTime, limit: max };
  } catch (error) {
    logger.error("Rate limit check failed", {
      component: "rate-limit",
      error: toErrMessage(error),
    });
    return SENSITIVE_ENDPOINTS.has(endpoint)
      ? { allowed: false, remaining: 0, resetTime, limit: max }
      : { allowed: true, remaining: max, resetTime, limit: max };
  }
}

/**
 * Extract client identifier string from request or auth context.
 * @param request HTTP Request object
 * @param auth Optional AuthResult context
 * @returns Formatted client identifier string
 */
export async function getClientIdentifier(
  request: Request,
  auth?: AuthResult,
): Promise<string> {
  if (auth?.authenticated && auth.userId) return `user:${auth.userId}`;
  return `ip:${request.headers.get("CF-Connecting-IP") || "unknown"}`;
}

/**
 * Create standard rate limit HTTP response headers.
 * @param result Rate limit check result
 * @returns Response Headers object
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
 * Middleware wrapper for standard route handlers.
 * @param env Worker environment bindings
 * @param endpoint Endpoint identifier string
 * @param auth Optional AuthResult context
 * @returns Handler wrapper function
 */
export function createRateLimitMiddleware(
  env: Env,
  endpoint: string,
  auth?: AuthResult,
): (request: Request, handler: () => Promise<Response>) => Promise<Response> {
  return async (request, handler) => {
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

    const response = await handler();
    const headers = createRateLimitHeaders(result);
    for (const [k, v] of headers.entries()) {
      response.headers.set(k, v);
    }
    return response;
  };
}

/**
 * Reset rate limit state for a client and endpoint.
 * @param env Worker environment bindings
 * @param identifier Client or key identifier string
 * @param endpoint Endpoint path string
 * @returns Promise resolving when deleted
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
  await env.DEALS_LOCK.delete(
    `${config.keyPrefix}:${identifier}:${windowStart}`,
  );
}
