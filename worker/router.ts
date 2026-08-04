import type { Env } from "./types";
import { logger } from "./lib/global-logger";
import { jsonResponse } from "./routes/utils";
import { toError } from "./lib/sanitize-error";
import { tryHandleLegacyRoutes } from "./router/legacy-routes";
import { withResponseTiming } from "./lib/request-timing";

// ============================================================================
// Centralized Middleware Pipeline (ADR-016)
// ============================================================================
import {
  registerRoutes,
  handlePipelineRequest,
} from "./lib/middleware/pipeline";
import { handleHealth, handleReady, handleLive } from "./routes/core";
import { handleD1Request } from "./routes/d1";
import { handleA2AAgentCard, handleA2ATask } from "./routes/a2a";

/**
 * Initialize pipeline-registered routes.
 * These routes go through the centralized middleware stack:
 *   cors → logging → rate-limit → auth → handler
 *
 * Health routes are migrated first as proof of concept.
 * D1 routes get auth (previously unprotected).
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
      description: "Health check",
    },
    {
      method: "GET",
      path: "/health/ready",
      handler: (_req, env) => handleReady(env, _req),
      auth: "public",
      description: "Readiness probe",
    },
    {
      method: "GET",
      path: "/health/live",
      handler: (_req, env) => handleLive(env, _req),
      auth: "public",
      description: "Liveness probe",
    },

    // -----------------------------------------------------------------------
    // A2A Agent Card — agent discovery for Agent-to-Agent protocol
    // -----------------------------------------------------------------------
    {
      method: "GET",
      path: "/.well-known/agent.json",
      handler: (req, env) => handleA2AAgentCard(req, env),
      auth: "public",
      description: "A2A agent discovery card",
    },
    {
      method: "POST",
      path: "/a2a",
      handler: (req, env) => handleA2ATask(req, env),
      auth: "api-key",
      rateLimit: {
        windowSeconds: 60,
        maxRequests: 20,
        keyPrefix: "ratelimit:a2a",
      },
      description: "Authenticated A2A research task endpoint",
    },

    // -----------------------------------------------------------------------
    // D1 Database API — admin-only with rate limiting (P1-1 fix)
    // Previously had no auth beyond the legacy catch-all.
    // -----------------------------------------------------------------------
    {
      method: ["GET", "POST", "PUT", "DELETE"],
      path: "/api/d1",
      handler: (req, env) => {
        const url = new URL(req.url);
        return handleD1Request(req, url, env);
      },
      auth: "internal",
      rateLimit: {
        windowSeconds: 60,
        maxRequests: 30,
        keyPrefix: "ratelimit:d1",
      },
      description: "D1 database operations (admin only)",
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
  const startTime = Date.now();
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // ── Centralized Pipeline (ADR-016) ──────────────────────────────────
    // Try the pipeline first. If a route matches, the pipeline handles it
    // with the full middleware stack. If no match, fall through to legacy.
    const pipelineResponse = await handlePipelineRequest(request, env);
    if (pipelineResponse) {
      return withResponseTiming(pipelineResponse, request, env, startTime);
    }

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
    if (legacyResponse) {
      return withResponseTiming(legacyResponse, request, env, startTime);
    }

    // 404
    return withResponseTiming(
      jsonResponse({ error: "Not found" }, 404, request, env),
      request,
      env,
      startTime,
    );
  } catch (error) {
    const err = toError(error);
    logger.error("Request handler error", {
      component: "router",
      error_message: err.message,
      error_stack: err.stack,
    });
    return withResponseTiming(
      jsonResponse({ error: "Internal server error" }, 500, request, env),
      request,
      env,
      startTime,
    );
  }
}
