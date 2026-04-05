/**
 * D1 Database API Routes - Stats & Categories
 *
 * Handles /api/d1/stats, /api/d1/domains, /api/d1/categories
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { createStructuredLogger } from "../../lib/logger";
import {
  getDealStats,
  getDomainsWithCounts,
  getCategoriesWithCounts,
} from "../../lib/d1/queries";

// ============================================================================
// Logger Helper
// ============================================================================

function getD1Logger(env: Env) {
  return createStructuredLogger(env, "d1-routes", `d1-${Date.now()}`);
}

// ============================================================================
// Database Statistics Endpoint - GET /api/d1/stats
// ============================================================================

export async function handleD1Stats(env: Env): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  try {
    const stats = await getDealStats(env.DEALS_DB);

    return jsonResponse({
      success: true,
      stats,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 stats error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return jsonResponse(
      {
        error: "Failed to retrieve statistics",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

// ============================================================================
// Domains Endpoint - GET /api/d1/domains
// ============================================================================

export async function handleD1Domains(env: Env): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  try {
    const domains = await getDomainsWithCounts(env.DEALS_DB);

    return jsonResponse({
      success: true,
      count: domains.length,
      domains,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 domains error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return jsonResponse(
      {
        error: "Failed to retrieve domains",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

// ============================================================================
// Categories Endpoint - GET /api/d1/categories
// ============================================================================

export async function handleD1Categories(env: Env): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  try {
    const categories = await getCategoriesWithCounts(env.DEALS_DB);

    return jsonResponse({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 categories error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return jsonResponse(
      {
        error: "Failed to retrieve categories",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}
