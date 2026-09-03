/**
 * Auth Middleware
 *
 * Handles authentication for pipeline-registered routes based on AuthTier.
 * Delegates to existing lib/auth.ts for API key verification.
 */

import type { Env } from "../../types";
import type { RouteConfig, MiddlewareFn } from "./types";
import { authenticateRequest, type AuthResult } from "../auth";
import { unauthorizedResponse, forbiddenResponse } from "../../routes/utils";
import { logger } from "../global-logger";

// WeakMap to propagate auth context without mutating immutable Request headers
const authContextStore = new WeakMap<Request, AuthResult>();

export function getAuthContext(request: Request): AuthResult | undefined {
  return authContextStore.get(request);
}

export function setAuthContext(request: Request, result: AuthResult): void {
  authContextStore.set(request, result);
}

// ============================================================================
// Auth Middleware
// ============================================================================

/**
 * Authentication middleware for the centralized pipeline.
 *
 * - `public`: No auth check, proceeds immediately.
 * - `api-key`: Requires valid API key via Bearer token or X-API-Key header.
 * - `internal`: Requires admin-level authentication.
 *
 * On success, attaches `authResult` to the request context for downstream use.
 * Returns a Response (401/403) to short-circuit on failure, or null to proceed.
 */
export const authMiddleware: MiddlewareFn = async (
  request: Request,
  env: Env,
  config: RouteConfig,
): Promise<Response | null> => {
  if (config.auth === "public") {
    return null;
  }

  try {
    const authResult = await authenticateRequest(request, env);

    if (!authResult.authenticated) {
      logger.warn("Auth middleware: authentication failed", {
        component: "middleware:auth",
        path: config.path,
        error: authResult.error,
      });
      return unauthorizedResponse(
        authResult.error || "Unauthorized",
        request,
        env,
      );
    }

    if (config.auth === "internal") {
      if (authResult.role !== "admin") {
        logger.warn("Auth middleware: insufficient role", {
          component: "middleware:auth",
          path: config.path,
          role: authResult.role,
          required: "admin",
        });
        return forbiddenResponse(
          "Internal endpoint requires admin role",
          request,
          env,
        );
      }
    }

    // Store auth context without mutating immutable Request headers (Workers runtime)
    authContextStore.set(request, authResult);

    return null;
  } catch (error) {
    logger.error("Auth middleware: unexpected error", {
      component: "middleware:auth",
      path: config.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return unauthorizedResponse("Authentication failed", request, env);
  }
};
