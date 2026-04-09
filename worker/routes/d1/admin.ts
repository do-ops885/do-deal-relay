/**
 * D1 Database API Routes - Admin
 *
 * Handles /api/d1/migrations, /api/d1/health, and authentication middleware.
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { createStructuredLogger } from "../../lib/logger";
import { getMigrationStatus, initDatabase } from "../../lib/d1/migrations";

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

  // Check for API key in header
  const apiKey = request.headers.get("X-API-Key");
  if (!apiKey) {
    return false;
  }

  // Require WEBHOOK_API_KEYS to be configured for all non-health requests
  if (!env.WEBHOOK_API_KEYS) {
    return false;
  }

  // Validate API key against stored keys
  const validKey = await env.WEBHOOK_API_KEYS.get(`apikey:${apiKey}`);
  if (!validKey) {
    return false;
  }

  return true;
}

// ============================================================================
// Logger Helper
// ============================================================================

function getD1Logger(env: Env) {
  return createStructuredLogger(env, "d1-routes", `d1-${Date.now()}`);
}

// ============================================================================
// Migration Status Endpoint - GET /api/d1/migrations
// ============================================================================

export async function handleD1Migrations(
  url: URL,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

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
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

// ============================================================================
// Database Health Check - GET /api/d1/health
// ============================================================================

export async function handleD1Health(env: Env): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

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
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}
