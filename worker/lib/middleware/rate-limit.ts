/**
 * Rate Limit Middleware
 *
 * Config-driven rate limiting for pipeline-registered routes.
 * Delegates to existing lib/rate-limit.ts for the actual KV-based rate limiting.
 */

import type { Env } from "../../types";
import type { RouteConfig, RouteParams, MiddlewareFn } from "./types";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
  getPerKeyRateLimitConfig,
} from "../rate-limit";
import { logger } from "../global-logger";

// ============================================================================
// Rate Limit Middleware
// ============================================================================

/**
 * Rate limiting middleware for the centralized pipeline.
 *
 * If the route config includes `rateLimit`, uses those settings.
 * Otherwise, falls back to the endpoint-specific defaults in lib/rate-limit.ts.
 *
 * Returns 429 Too Many Requests on limit exceeded, or null to proceed.
 */
export const rateLimitMiddleware: MiddlewareFn = async (
  request: Request,
  env: Env,
  config: RouteConfig,
): Promise<Response | null> => {
  if (!config.rateLimit) {
    // No custom rate limit — check if endpoint defaults exist in rate-limit.ts
    // by passing through with the standard endpoint key
    return rateLimitWithDefaults(request, env, config);
  }

  try {
    const clientId = await getClientIdentifier(request);

    // Build per-key config from route config
    const perKeyConfig = {
      maxRequests: config.rateLimit.maxRequests,
      windowSeconds: config.rateLimit.windowSeconds,
      keyPrefix: config.rateLimit.keyPrefix || `ratelimit:${config.path}`,
    };

    const result = await checkRateLimit(
      env,
      clientId,
      config.path,
      perKeyConfig,
    );

    if (!result.allowed) {
      const retryAfter = Math.ceil(result.resetTime - Date.now() / 1000);
      logger.warn("Rate limit exceeded", {
        component: "middleware:rate-limit",
        path: config.path,
        clientId,
        retryAfter,
      });
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retry_after: retryAfter,
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

    // Proceed — rate limit headers will be added by the pipeline after handler execution
    return null;
  } catch (error) {
    // Fail open: if rate limiting infrastructure fails, allow the request
    logger.error("Rate limit middleware: unexpected error", {
      component: "middleware:rate-limit",
      path: config.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/**
 * Apply endpoint-default rate limits from lib/rate-limit.ts when no custom
 * config is specified on the route.
 */
async function rateLimitWithDefaults(
  request: Request,
  env: Env,
  config: RouteConfig,
): Promise<Response | null> {
  try {
    const clientId = await getClientIdentifier(request);
    const result = await checkRateLimit(env, clientId, config.path);

    if (!result.allowed) {
      const retryAfter = Math.ceil(result.resetTime - Date.now() / 1000);
      logger.warn("Rate limit exceeded (default)", {
        component: "middleware:rate-limit",
        path: config.path,
        clientId,
      });
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retry_after: retryAfter,
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

    return null;
  } catch (error) {
    logger.error("Rate limit middleware (default): unexpected error", {
      component: "middleware:rate-limit",
      path: config.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
