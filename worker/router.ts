import type { Env } from "./types";
import { logger } from "./lib/global-logger";
import { jsonResponse } from "./routes/utils";
import { toError } from "./lib/sanitize-error";
import { tryHandleLegacyRoutes } from "./router/legacy-routes";

// ============================================================================
// Centralized Middleware Pipeline (ADR-016)
// ============================================================================
import {
  registerRoutes,
  handlePipelineRequest,
} from "./lib/middleware/pipeline";
import { handleHealth, handleReady, handleLive } from "./routes/core";

/**
 * Initialize pipeline-registered routes.
 * These routes go through the centralized middleware stack:
 *   cors → logging → rate-limit → auth → handler
 *
 * Health routes are migrated first as proof of concept.
 * D1 routes remain on the legacy admin-gated ladder (see legacy-routes.ts);
 * the bare pipeline "/api/d1" registration was removed as dead (always 404).
 * Rate limiting is added to routes that lacked it.
 */
function initPipelineRoutes(): void {
  registerRoutes([
    // -----------------------------------------------------------------------
    // Health checks (public, no rate limit)
    // -----------------------------------------------------------------------
    {
      method: "GET",
      path: "/health",
      handler: (_req, env) => handleHealth(env, _req),
      auth: "public",
      rateLimit: false,
      description: "Health check",
    },
    {
      method: "GET",
      path: "/health/ready",
      handler: (_req, env) => handleReady(env, _req),
      auth: "public",
      rateLimit: false,
      description: "Readiness probe",
    },
    {
      method: "GET",
      path: "/health/live",
      handler: (_req, env) => handleLive(env, _req),
      auth: "public",
      rateLimit: false,
      description: "Liveness probe",
    },
  ]);
}

// Initialize routes on module load
initPipelineRoutes();

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // ── Centralized Pipeline (ADR-016) ──────────────────────────────────
    // Try the pipeline first. If a route matches, the pipeline handles it
    // with the full middleware stack. If no match, fall through to legacy.
    const pipelineResponse = await handlePipelineRequest(request, env);
    if (pipelineResponse) return pipelineResponse;

    // ── Legacy Routes (pre-pipeline) ────────────────────────────────────
    // These routes will be migrated to the pipeline incrementally.
    // The full legacy dispatch ladder lives in ./router/legacy-routes.ts
    // to keep router.ts under the 500-line hard constraint. The helper
    // returns `null` when no legacy route matched.
    const legacyResponse = await tryHandleLegacyRoutes(
      request,
      env,
      ctx,
      url,
      path,
    );
    if (legacyResponse) return legacyResponse;

    // 404
    return jsonResponse({ error: "Not found" }, 404, request, env);
  } catch (error) {
    const err = toError(error);
    logger.error("Request handler error", {
      component: "router",
      error_message: err.message,
      error_stack: err.stack,
    });
    return jsonResponse({ error: "Internal server error" }, 500, request, env);
  }
}
