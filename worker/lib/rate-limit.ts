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
import { listAllKvKeys } from "./kv-pagination";

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

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

interface RateLimitState {
  count: number;
  windowStart: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: "ratelimit",
};
const DEFAULT_KV_MAX_REQUESTS = 100;
const DEFAULT_KV_WINDOW_SECONDS = 60;
const KV_KEY_PREFIX = "rl:kv";

const cfg = (max: number, p = "", win = 60): RateLimitConfig => ({
  maxRequests: max,
  windowSeconds: win,
  keyPrefix: p ? `ratelimit:${p}` : "ratelimit",
});

const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
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

const rlRes = (
  allowed: boolean,
  remaining: number,
  resetTime: number,
  limit: number,
): RateLimitResult => ({
  allowed,
  remaining,
  resetTime,
  limit,
});

const kvRes = (
  allowed: boolean,
  remaining: number,
  resetAt: Date,
  total: number,
): RateLimitKVResult => ({
  allowed,
  remaining,
  resetAt,
  total,
});

/** Check rate limit via binding (primary) or KV (fallback). */
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
          ? rlRes(true, max - 1, resetTime, max)
          : rlRes(false, 0, resetTime, max);
      }
    } catch (error) {
      logger.error("Rate limit binding check failed", {
        component: "rate-limit",
        endpoint,
        error: toErrMessage(error),
      });
      if (SENSITIVE_ENDPOINTS.has(endpoint))
        return rlRes(false, 0, resetTime, max);
    }
  }

  const key = `${config.keyPrefix}:${id}:${windowStart}`;
  if (!env.DEALS_LOCK) return rlRes(true, max, resetTime, max);

  try {
    const state = await env.DEALS_LOCK.get<RateLimitState>(key, "json");
    const currentCount = state?.count || 0;
    if (currentCount >= max) return rlRes(false, 0, resetTime, max);

    const newCount = currentCount + 1;
    await env.DEALS_LOCK.put(
      key,
      JSON.stringify({ count: newCount, windowStart }),
      { expirationTtl: config.windowSeconds },
    );
    return rlRes(true, max - newCount, resetTime, max);
  } catch (error) {
    logger.error("Rate limit check failed", {
      component: "rate-limit",
      error: toErrMessage(error),
    });
    return SENSITIVE_ENDPOINTS.has(endpoint)
      ? rlRes(false, 0, resetTime, max)
      : rlRes(true, max, resetTime, max);
  }
}

/** Check rate limit in KV with sliding window semantics. */
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

  if (maxRequests <= 0) return kvRes(false, 0, resetAt, 0);

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
      return kvRes(true, maxRequests - 1, resetAt, maxRequests);
    }

    if (state.request_count >= maxRequests)
      return kvRes(false, 0, resetAt, maxRequests);

    state.request_count += 1;
    await env.DEALS_LOCK.put(key, JSON.stringify(state), {
      expirationTtl: windowSeconds * 2,
    });
    return kvRes(true, maxRequests - state.request_count, resetAt, maxRequests);
  } catch (error) {
    logger.error("Rate limit KV check failed", {
      component: "rate-limit-kv",
      clientId,
      error: toErrMessage(error),
    });
    return kvRes(true, maxRequests, resetAt, maxRequests);
  }
}

/** Get client rate limit state from KV. */
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

/** Reset rate limit entry in KV. */
export async function resetRateLimitKV(
  env: Env,
  id: string,
  _win = DEFAULT_KV_WINDOW_SECONDS,
): Promise<void> {
  await env.DEALS_LOCK.delete(`${KV_KEY_PREFIX}:${id}`);
}

/** List all rate limit states from KV. */
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

/** Create rate limit store helper for KV operations. */
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

/** Check rate limits for multiple client IDs in parallel. */
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

/** Aggregate statistics across all active rate limit states in KV. */
export async function getRateLimitStats(env: Env): Promise<{
  activeClients: number;
  rateLimitedClients: number;
  avgRequestsPerClient: number;
}> {
  const states = await getAllRateLimitStates(env);
  let totalRequests = 0;
  let rateLimited = 0;
  for (const s of states.values()) {
    totalRequests += s.request_count;
    if (s.request_count >= DEFAULT_KV_MAX_REQUESTS) rateLimited++;
  }
  return {
    activeClients: states.size,
    rateLimitedClients: rateLimited,
    avgRequestsPerClient: states.size > 0 ? totalRequests / states.size : 0,
  };
}

/** Extract client identifier string from request or auth context. */
export async function getClientIdentifier(
  request: Request,
  auth?: AuthResult,
): Promise<string> {
  if (auth?.authenticated && auth.userId) return `user:${auth.userId}`;
  return `ip:${request.headers.get("CF-Connecting-IP") || "unknown"}`;
}

/** Create standard rate limit HTTP response headers. */
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

/** Middleware wrapper for standard route handlers. */
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
    headers.forEach((v, k) => response.headers.set(k, v));
    return response;
  };
}

/** Middleware wrapper for KV-based rate limiting. */
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

/** Reset rate limit state for a client and endpoint. */
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
