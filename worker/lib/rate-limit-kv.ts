/**
 * KV Sliding-Window Rate Limiting
 *
 * Split from rate-limit.ts per IMP-6 (LOC hygiene). Fallback/store path for
 * the primary Workers Rate Limiting bindings (ADR-028). Every export is
 * re-exported through ./rate-limit so existing importers are unchanged.
 *
 * @module worker/lib/rate-limit-kv
 */

import type { Env } from "../types";
import { logger } from "./global-logger";
import { toErrMessage } from "./errors";
import { listAllKvKeys } from "./kv-pagination";
import type { RateLimitConfig } from "./rate-limit-config";

export interface RateLimitKVResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  total: number;
}

export interface RateLimitKVState {
  client_id: string;
  request_count: number;
  window_start: number;
}

export interface RateLimitStore {
  checkLimit(
    id: string,
    max?: number,
    win?: number,
  ): Promise<RateLimitKVResult>;
  getState(id: string): Promise<RateLimitKVState | null>;
  reset(id: string): Promise<void>;
  config: RateLimitConfig;
}

export const DEFAULT_KV_MAX_REQUESTS = 100;
export const DEFAULT_KV_WINDOW_SECONDS = 60;
const KV_KEY_PREFIX = "rl:kv";

/**
 * Check rate limit in KV with sliding window semantics.
 * @param env Worker environment bindings
 * @param clientId Client identifier string
 * @param maxRequests Maximum allowed requests in window
 * @param windowSeconds Window duration in seconds
 * @returns KV rate limit check result
 */
export async function checkRateLimitKV(
  env: Env,
  clientId: string,
  maxRequests = DEFAULT_KV_MAX_REQUESTS,
  windowSeconds = DEFAULT_KV_WINDOW_SECONDS,
): Promise<RateLimitKVResult> {
  const windowStart =
    Math.floor(Math.floor(Date.now() / 1000) / windowSeconds) * windowSeconds;
  const resetAt = new Date((windowStart + windowSeconds) * 1000);
  const key = `${KV_KEY_PREFIX}:${clientId}`;

  if (maxRequests <= 0) {
    return { allowed: false, remaining: 0, resetAt, total: 0 };
  }

  try {
    const state = await env.DEALS_LOCK.get<RateLimitKVState>(key, "json");
    if (!state || state.window_start !== windowStart) {
      await env.DEALS_LOCK.put(
        key,
        JSON.stringify({
          client_id: clientId,
          request_count: 1,
          window_start: windowStart,
        } as RateLimitKVState),
        { expirationTtl: windowSeconds * 2 },
      );
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt,
        total: maxRequests,
      };
    }

    if (state.request_count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt, total: maxRequests };
    }

    state.request_count += 1;
    await env.DEALS_LOCK.put(key, JSON.stringify(state), {
      expirationTtl: windowSeconds * 2,
    });
    return {
      allowed: true,
      remaining: maxRequests - state.request_count,
      resetAt,
      total: maxRequests,
    };
  } catch (error) {
    logger.error("Rate limit KV check failed", {
      component: "rate-limit-kv",
      clientId,
      error: toErrMessage(error),
    });
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt,
      total: maxRequests,
    };
  }
}

/**
 * Get client rate limit state from KV.
 * @param env Worker environment bindings
 * @param id Client identifier string
 * @param win Window duration in seconds
 * @returns Rate limit state or null if expired/absent
 */
export async function getRateLimitKVState(
  env: Env,
  id: string,
  win = DEFAULT_KV_WINDOW_SECONDS,
): Promise<RateLimitKVState | null> {
  const now = Math.floor(Date.now() / 1000 / win) * win;
  try {
    const state = await env.DEALS_LOCK.get<RateLimitKVState>(
      `${KV_KEY_PREFIX}:${id}`,
      "json",
    );
    return state && state.window_start === now ? state : null;
  } catch {
    return null;
  }
}

/**
 * Reset rate limit entry in KV.
 * @param env Worker environment bindings
 * @param id Client identifier string
 * @param _win Window duration in seconds
 * @returns Promise resolving when deleted
 */
export async function resetRateLimitKV(
  env: Env,
  id: string,
  _win = DEFAULT_KV_WINDOW_SECONDS,
): Promise<void> {
  await env.DEALS_LOCK.delete(`${KV_KEY_PREFIX}:${id}`);
}

/**
 * List all rate limit states from KV.
 * @param env Worker environment bindings
 * @returns Map of client IDs to rate limit states
 */
export async function getAllRateLimitStates(
  env: Env,
): Promise<Map<string, RateLimitKVState>> {
  const states = new Map<string, RateLimitKVState>();
  try {
    const list = await listAllKvKeys(env.DEALS_LOCK, {
      prefix: `${KV_KEY_PREFIX}:`,
    });
    for (const k of list.keys) {
      const state = await env.DEALS_LOCK.get<RateLimitKVState>(k.name, "json");
      if (state) states.set(k.name.replace(`${KV_KEY_PREFIX}:`, ""), state);
    }
  } catch (error) {
    logger.error("Failed to list rate limit states", {
      component: "rate-limit-kv",
      error: toErrMessage(error),
    });
  }
  return states;
}

/**
 * Create rate limit store helper for KV operations.
 * @param env Worker environment bindings
 * @param options Optional store configuration options
 * @returns RateLimitStore interface implementation
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
    maxRequests: options?.maxRequests ?? DEFAULT_KV_MAX_REQUESTS,
    windowSeconds: options?.windowSeconds ?? DEFAULT_KV_WINDOW_SECONDS,
    keyPrefix: options?.keyPrefix ?? KV_KEY_PREFIX,
  };
  return {
    checkLimit: (id, max = config.maxRequests, win = config.windowSeconds) =>
      checkRateLimitKV(env, id, max, win),
    getState: (id) => getRateLimitKVState(env, id, config.windowSeconds),
    reset: (id) => resetRateLimitKV(env, id, config.windowSeconds),
    config,
  };
}

/**
 * Check rate limits for multiple client IDs in parallel.
 * @param env Worker environment bindings
 * @param ids Array of client identifier strings
 * @param max Maximum allowed requests
 * @param win Window duration in seconds
 * @returns Map of client IDs to KV rate limit results
 */
export async function batchCheckRateLimitKV(
  env: Env,
  ids: string[],
  max = DEFAULT_KV_MAX_REQUESTS,
  win = DEFAULT_KV_WINDOW_SECONDS,
): Promise<Map<string, RateLimitKVResult>> {
  const results = new Map<string, RateLimitKVResult>();
  await Promise.all(
    ids.map(async (id) =>
      results.set(id, await checkRateLimitKV(env, id, max, win)),
    ),
  );
  return results;
}

/**
 * Middleware wrapper for KV-based rate limiting.
 * @param env Worker environment bindings
 * @param options Middleware configuration options
 * @returns Handler wrapper function
 */
export function createRateLimitKVMiddleware(
  env: Env,
  options?: {
    maxRequests?: number;
    windowSeconds?: number;
    getClientId?: (r: Request) => string;
  },
) {
  const maxRequests = options?.maxRequests ?? DEFAULT_KV_MAX_REQUESTS;
  const windowSeconds = options?.windowSeconds ?? DEFAULT_KV_WINDOW_SECONDS;
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
      const retryAfter = Math.ceil(
        (result.resetAt.getTime() - Date.now()) / 1000,
      );
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retry_after: retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": result.total.toString(),
            "X-RateLimit-Remaining": result.remaining.toString(),
            "X-RateLimit-Reset": result.resetAt.toISOString(),
            "Retry-After": retryAfter.toString(),
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
