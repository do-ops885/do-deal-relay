/**
 * Middleware Pipeline
 *
 * Centralized route registration and middleware stack for the do-deal-relay
 * Worker. Replaces ad-hoc handler registration in router.ts with a
 * declarative, config-driven approach.
 *
 * Middleware order: cors → logging → rate-limit → auth → validation
 *
 * See: plans/ADR-016-centralized-middleware-architecture.md
 */

import type { Env } from "../../types";
import type {
  RouteConfig,
  RouteMatch,
  RouteParams,
  HttpMethod,
  MiddlewareFn,
} from "./types";
import { authMiddleware } from "./auth";
import { rateLimitMiddleware } from "./rate-limit";
import {
  jsonResponse,
  getAllowedOrigin,
  SECURITY_HEADERS,
} from "../../routes/utils";
import { checkBodySize } from "../../middleware/body-limit";
import { logger } from "../global-logger";

// ============================================================================
// Route Registry
// ============================================================================

/** Registered route configurations (populated by registerRoutes) */
let registeredRoutes: RouteConfig[] = [];

/**
 * Register routes with the middleware pipeline.
 * Can be called once at startup; replaces any previously registered routes.
 */
export function registerRoutes(routes: RouteConfig[]): void {
  registeredRoutes = [...routes];
}

/**
 * Get all currently registered routes (for introspection/testing).
 */
export function getRegisteredRoutes(): readonly RouteConfig[] {
  return registeredRoutes;
}

// ============================================================================
// Route Matching
// ============================================================================

/**
 * Match a request against registered routes.
 * Supports exact paths and `:param` path variables.
 *
 * @returns RouteMatch with extracted params, or null if no match.
 */
export function matchRoute(method: string, path: string): RouteMatch | null {
  for (const config of registeredRoutes) {
    const methods = Array.isArray(config.method)
      ? config.method
      : [config.method];
    if (!methods.includes(method as HttpMethod)) continue;

    const params = matchPath(config.path, path);
    if (params !== null) {
      return { config, params };
    }
  }
  return null;
}

/**
 * Match a request path against a route pattern with `:param` placeholders.
 * Returns extracted params on match, or null on mismatch.
 */
function matchPath(pattern: string, actual: string): RouteParams | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const actualParts = actual.split("/").filter(Boolean);

  if (patternParts.length !== actualParts.length) return null;

  const params: RouteParams = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    const ap = actualParts[i]!;
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = decodeURIComponent(ap);
    } else if (pp !== ap) {
      return null;
    }
  }
  return params;
}

// ============================================================================
// Middleware Stack
// ============================================================================

/**
 * CORS middleware — handles OPTIONS preflight and adds CORS headers.
 */
function corsMiddleware(request: Request, env: Env): Response | null {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(origin, env),
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key, X-Correlation-ID, X-Webhook-Signature, MCP-Session-Id",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  return null;
}

/**
 * Logging middleware — logs incoming requests for EU AI Act compliance
 * and operational observability.
 */
function loggingMiddleware(
  request: Request,
  _env: Env,
  config: RouteConfig,
): void {
  const url = new URL(request.url);
  logger.info("Pipeline request", {
    component: "middleware:pipeline",
    method: request.method,
    path: config.path,
    fullPath: url.pathname,
    auth: config.auth,
  });
}

// ============================================================================
// Pipeline Executor
// ============================================================================

/**
 * Execute the full middleware pipeline for a matched route.
 *
 * Order: cors → logging → rate-limit → auth → validation → handler
 *
 * Returns a Response. If any middleware short-circuits, that response is returned
 * immediately without executing subsequent middleware or the handler.
 */
export async function executePipeline(
  request: Request,
  env: Env,
  match: RouteMatch,
): Promise<Response> {
  const { config, params } = match;

  // 1. CORS (handles OPTIONS preflight)
  const corsResponse = corsMiddleware(request, env);
  if (corsResponse) return corsResponse;

  // 2. Logging
  loggingMiddleware(request, env, config);

  // 3. Body size limit (if configured)
  if (config.bodySizeLimit) {
    const tooLarge = checkBodySize(request, config.bodySizeLimit);
    if (tooLarge) return tooLarge;
  }

  // 4. Rate Limit
  const rateLimitResponse = await rateLimitMiddleware(
    request,
    env,
    config,
    params,
  );
  if (rateLimitResponse) return rateLimitResponse;

  // 5. Auth
  const authResponse = await authMiddleware(request, env, config, params);
  if (authResponse) return authResponse;

  // 6. Execute handler
  try {
    const response = await config.handler(request, env, params);
    return response;
  } catch (error) {
    logger.error("Pipeline handler error", {
      component: "middleware:pipeline",
      path: config.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Internal server error" }, 500, request, env);
  }
}

// ============================================================================
// Pipeline Router Entry Point
// ============================================================================

/**
 * Attempt to handle a request through the pipeline.
 *
 * Returns a Response if a route matched, or null if no route was found
 * (caller should fall through to legacy routing).
 */
export async function handlePipelineRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = matchRoute(request.method, url.pathname);

  if (!match) return null;

  return executePipeline(request, env, match);
}
