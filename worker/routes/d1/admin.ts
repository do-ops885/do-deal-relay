/**
 * D1 Database API Routes - Admin
 *
 * Handles /api/d1/migrations, /api/d1/health, and authentication middleware.
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { getD1Logger, requireD1Db } from "./helpers";
import { getMigrationStatus, initDatabase } from "../../lib/d1/migrations";
import { authenticateRequest } from "../../lib/auth";

// ============================================================================
// Authentication Middleware
// ============================================================================

export async function authenticateD1Request(
  env: Env,
  request: Request,
): Promise<boolean> {
  // Skip auth for health check
  const url = new URL(request.url);
  if (url.pathname === "/api/d1/health") return true;

  // Use unified authentication library
  const auth = await authenticateRequest(request, env);
  return auth.authenticated;
}

// ============================================================================
// Migration Status Endpoint - GET /api/d1/migrations
// ============================================================================

export async function handleD1Migrations(
  url: URL,
  env: Env,
): Promise<Response> {
  const dbGuard = requireD1Db(env);
  if (dbGuard) return dbGuard;

  const action = url.searchParams.get("action");

  try {
    if (action === "init") {
      // Initialize database with all migrations
      const result = await initDatabase(env.DEALS_DB);
      return jsonResponse({
        success: result.success,
        message: `Database initialized to version ${result.currentVersion}`,
        applied: result.applied,
        error: result.error,
      });
    }

    // Get migration status
    const status = await getMigrationStatus(env.DEALS_DB);

    return jsonResponse({
      success: true,
      status: {
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        pendingCount: status.pending.length,
        pending: status.pending,
        appliedCount: status.applied.length,
      },
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 migrations error",
      error instanceof Error ? error : new Error(String(error)),
      {
        action,
      },
    );
    return jsonResponse(
      {
        error: "Failed to retrieve migration status",
      },
      500,
    );
  }
}

// ============================================================================
// Database Health Check - GET /api/d1/health
// ============================================================================

export async function handleD1Health(env: Env): Promise<Response> {
  const dbGuard = requireD1Db(env);
  if (dbGuard) return dbGuard;

  try {
    const client = env.DEALS_DB;

    // Test connection with a simple query
    const testResult = await client
      .prepare("SELECT 1 as test")
      .first<{ test: number }>();

    // Get migration status
    const status = await getMigrationStatus(env.DEALS_DB);

    return jsonResponse({
      success: true,
      healthy: testResult?.test === 1,
      status: {
        connected: true,
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        pendingMigrations: status.pending.length,
      },
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 health check error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return jsonResponse(
      {
        success: false,
        healthy: false,
        error: "Database health check failed",
      },
      500,
    );
  }
}
