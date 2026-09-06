import type { Env } from "../types";
import { checkBodySize } from "../middleware/body-limit";
import { withAuth } from "../lib/auth";
import { createRateLimitMiddleware } from "../lib/rate-limit";
import { handleHealth, handleReady, handleLive } from "../routes/core";
import {
  handleRegister,
  handleLogin,
  handleRefreshToken,
  handleGetCurrentUser,
  handleUpdateProfile,
  handleListUsers,
} from "../routes/auth";
import {
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
} from "../routes/admin/keys";

/**
 * Health, auth, and admin identity routes extracted from legacy-routes.ts
 * (same pattern as ops-routes.ts / mcp-stream-routes.ts). Dispatch order and
 * behavior are unchanged: health checks and auth endpoints were the first
 * entries of the original ladder; the API key management block retains its
 * original position via a separate entry point below.
 *
 * Returns the matching Response, or `null` if no route in this group matched.
 */
export async function tryHandleLegacyAuthRoutes(
  request: Request,
  env: Env,
  url: URL,
  path: string,
): Promise<Response | null> {
  // Health checks (kept as fallback; primary routes now in pipeline)
  if (path === "/health") return handleHealth(env, request);
  if (path === "/health/ready") return handleReady(env, request);
  if (path === "/health/live") return handleLive(env, request);

  // Auth & User Management
  if (path === "/api/auth/register" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    const rateLimiter = createRateLimitMiddleware(env, "/api/auth/register");
    return rateLimiter(request, () => handleRegister(request, env));
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    const rateLimiter = createRateLimitMiddleware(env, "/api/auth/login");
    return rateLimiter(request, () => handleLogin(request, env));
  }
  if (path === "/api/auth/refresh" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    const rateLimiter = createRateLimitMiddleware(env, "/api/auth/refresh");
    return rateLimiter(request, () => handleRefreshToken(request, env));
  }
  if (path === "/api/auth/me" && request.method === "GET") {
    return withAuth(request, env, undefined, (auth) =>
      handleGetCurrentUser(auth, request, env),
    );
  }
  if (path === "/api/auth/me" && request.method === "PUT") {
    const bodyTooLarge = checkBodySize(request, 5 * 1024);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) =>
      handleUpdateProfile(auth, request, env),
    );
  }

  // Admin: User management
  if (path === "/api/admin/users" && request.method === "GET") {
    return withAuth(request, env, "admin", (auth) =>
      handleListUsers(auth, request, env),
    );
  }

  // url reserved for parity with sibling route groups (unused here).
  void url;

  // No route in this group matched.
  return null;
}

/**
 * Admin API key management routes. Kept as a separate entry point so the
 * original dispatch position (after ops routes) is preserved exactly.
 */
export async function tryHandleAdminKeyRoutes(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === "/api/admin/keys") {
    if (request.method === "POST") {
      return withAuth(request, env, "admin", () =>
        handleCreateApiKey(request, env),
      );
    }
    if (request.method === "GET") {
      return withAuth(request, env, "admin", () =>
        handleListApiKeys(request, env),
      );
    }
  }

  const apiKeyRevokeMatch = path.match(/^\/api\/admin\/keys\/([^/]+)$/);
  if (apiKeyRevokeMatch && request.method === "DELETE") {
    const hash = apiKeyRevokeMatch[1];
    if (hash) {
      return withAuth(request, env, "admin", () =>
        handleRevokeApiKey(request, hash, env),
      );
    }
  }

  return null;
}
