import type { Env } from "../types";
import { checkBodySize } from "../middleware/body-limit";
import { withAuth } from "../lib/auth";
import { createRateLimitMiddleware } from "../lib/rate-limit";
import { handleBulkImport } from "../routes/bulk/import";
import { handleBulkExport } from "../routes/bulk/export";
import {
  handleDashboardStats,
  handleDashboardRecentActivity,
  handleDashboardSystemHealth,
} from "../routes/dashboard";

/** Max accepted JSON body for bulk import (50 KiB). */
const BULK_IMPORT_MAX_BODY_BYTES = 50 * 1024;

/**
 * Ops routes (bulk + dashboard), extracted from legacy-routes.ts to keep
 * the legacy dispatcher under the source-size limit.
 *
 * - POST /api/bulk/import (user auth, rate-limited)
 * - GET /api/bulk/export (user auth, rate-limited)
 * - GET /api/dashboard/stats|activity|health (admin-only ops surface)
 *
 * Returns the matching Response, or `null` if no ops route matched.
 */
export async function tryHandleOpsRoutes(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === "/api/bulk/import" && request.method === "POST") {
    const bodyTooLarge = checkBodySize(request, BULK_IMPORT_MAX_BODY_BYTES);
    if (bodyTooLarge) return bodyTooLarge;
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/bulk/import",
        auth,
      );
      return rateLimiter(request, () => handleBulkImport(request, env));
    });
  }
  if (path === "/api/bulk/export" && request.method === "GET") {
    return withAuth(request, env, "user", (auth) => {
      const rateLimiter = createRateLimitMiddleware(
        env,
        "/api/bulk/export",
        auth,
      );
      return rateLimiter(request, () => handleBulkExport(request, env));
    });
  }

  if (path === "/api/dashboard/stats" && request.method === "GET") {
    return withAuth(request, env, "admin", () =>
      handleDashboardStats(env, request),
    );
  }
  if (path === "/api/dashboard/activity" && request.method === "GET") {
    return withAuth(request, env, "admin", () =>
      handleDashboardRecentActivity(env, request),
    );
  }
  if (path === "/api/dashboard/health" && request.method === "GET") {
    return withAuth(request, env, "admin", () =>
      handleDashboardSystemHealth(env, request),
    );
  }

  return null;
}
