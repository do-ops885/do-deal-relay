/**
 * D1 Database API Routes
 * Advanced queries, full-text search, and database statistics
 */

import type { Env } from "../types";
import { jsonResponse } from "./utils";
import { createStructuredLogger } from "../lib/logger";
import {
  searchDeals,
  getDealStats,
  getDealsByDomain,
  getDealsByCategory,
  getActiveDeals,
  getExpiringDeals,
  getSearchSuggestions,
  getDomainsWithCounts,
  getCategoriesWithCounts,
  getSimilarDealsD1,
  getRecommendedDealsD1,
  getTrendingDealsD1,
  type DealSearchResult,
  type ExpiringDeal,
} from "../lib/d1/queries";
import { getMigrationStatus, initDatabase } from "../lib/d1/migrations";

// ============================================================================
// Authentication Middleware
// ============================================================================

async function authenticateD1Request(
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

  // If WEBHOOK_API_KEYS is configured, validate against it
  if (env.WEBHOOK_API_KEYS) {
    const validKey = await env.WEBHOOK_API_KEYS.get(`apikey:${apiKey}`);
    if (!validKey) {
      return false;
    }
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
// Search Endpoint - GET /api/d1/search
// ============================================================================

export async function handleD1Search(url: URL, env: Env): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  const query = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const includeExpired = url.searchParams.get("include_expired") === "true";
  const status = url.searchParams.get("status") || undefined;

  if (!query) {
    return jsonResponse({ error: "Query parameter 'q' is required" }, 400);
  }

  try {
    const results = await searchDeals(env.DEALS_DB, query, {
      limit,
      includeExpired,
      status,
    });

    return jsonResponse({
      success: true,
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 search error",
      error instanceof Error ? error : new Error(String(error)),
      { query },
    );
    return jsonResponse({ error: "Search failed" }, 500);
  }
}

// ============================================================================
// Search Suggestions Endpoint - GET /api/d1/suggestions
// ============================================================================

export async function handleD1Suggestions(
  url: URL,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  const partial = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  if (!partial || partial.length < 2) {
    return jsonResponse(
      { error: "Query parameter 'q' with at least 2 characters is required" },
      400,
    );
  }

  try {
    const suggestions = await getSearchSuggestions(
      env.DEALS_DB,
      partial,
      limit,
    );

    return jsonResponse({
      success: true,
      query: partial,
      suggestions,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 suggestions error",
      error instanceof Error ? error : new Error(String(error)),
      {
        partial,
      },
    );
    return jsonResponse(
      {
        error: "Suggestions failed",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
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
// Advanced Filtering Endpoint - GET /api/d1/deals
// ============================================================================

export async function handleD1Deals(url: URL, env: Env): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  const domain = url.searchParams.get("domain");
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status") || "active";
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const minConfidence = url.searchParams.has("min_confidence")
    ? parseFloat(url.searchParams.get("min_confidence")!)
    : undefined;
  const expiringDays = url.searchParams.has("expiring_in")
    ? parseInt(url.searchParams.get("expiring_in")!, 10)
    : undefined;

  try {
    let results;
    let metadata: Record<string, unknown> = { filter: {} };

    if (expiringDays !== undefined) {
      // Get expiring deals
      results = await getExpiringDeals(env.DEALS_DB, expiringDays);
      metadata.filter = { type: "expiring", days: expiringDays };
    } else if (domain) {
      // Get by domain
      results = await getDealsByDomain(env.DEALS_DB, domain, {
        limit,
        activeOnly: status === "active",
      });
      metadata.filter = { type: "domain", domain };
    } else if (category) {
      // Get by category
      results = await getDealsByCategory(env.DEALS_DB, category, {
        limit,
        activeOnly: status === "active",
      });
      metadata.filter = { type: "category", category };
    } else {
      // Get active deals (default)
      results = await getActiveDeals(env.DEALS_DB, limit);
      metadata.filter = { type: "active" };
    }

    // Filter by confidence if specified
    if (minConfidence !== undefined) {
      results = results.filter((d: DealSearchResult | ExpiringDeal) => {
        // Only filter DealSearchResult which has confidence_score
        if ("confidence_score" in d && typeof d.confidence_score === "number") {
          return d.confidence_score >= minConfidence;
        }
        return true;
      });
      metadata.filter = { ...(metadata.filter as object), minConfidence };
    }

    return jsonResponse({
      success: true,
      count: results.length,
      metadata,
      results,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 deals error",
      error instanceof Error ? error : new Error(String(error)),
      {
        domain,
        category,
        status,
      },
    );
    return jsonResponse(
      {
        error: "Failed to retrieve deals",
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

// ============================================================================
// Main Handler Router
// ============================================================================

export async function handleD1Request(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  // Authenticate request
  const authenticated = await authenticateD1Request(env, request);
  if (!authenticated) {
    return jsonResponse(
      { error: "Unauthorized. X-API-Key header required." },
      401,
    );
  }

  const path = url.pathname;

  // Search endpoints
  if (path === "/api/d1/search" && request.method === "GET") {
    return handleD1Search(url, env);
  }

  if (path === "/api/d1/suggestions" && request.method === "GET") {
    return handleD1Suggestions(url, env);
  }

  // Statistics
  if (path === "/api/d1/stats" && request.method === "GET") {
    return handleD1Stats(env);
  }

  // Filtering
  if (path === "/api/d1/deals" && request.method === "GET") {
    return handleD1Deals(url, env);
  }

  if (path === "/api/d1/domains" && request.method === "GET") {
    return handleD1Domains(env);
  }

  if (path === "/api/d1/categories" && request.method === "GET") {
    return handleD1Categories(env);
  }

  // Migrations
  if (path === "/api/d1/migrations") {
    return handleD1Migrations(url, env);
  }

  // Health
  if (path === "/api/d1/health" && request.method === "GET") {
    return handleD1Health(env);
  }

  // Recommendations
  if (path === "/api/d1/similar" && request.method === "GET") {
    return handleD1Similar(url, env);
  }

  if (path === "/api/d1/recommended" && request.method === "GET") {
    return handleD1Recommended(url, env);
  }

  if (path === "/api/d1/trending" && request.method === "GET") {
    return handleD1Trending(url, env);
  }

  return jsonResponse({ error: "D1 endpoint not found" }, 404);
}

/**
 * Handle similar deals from D1 - GET /api/d1/similar?deal_id=X
 */
async function handleD1Similar(url: URL, env: Env): Promise<Response> {
  const dealId = url.searchParams.get("deal_id");
  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 5;
  const includeExpired = url.searchParams.get("include_expired") === "true";

  if (!dealId) {
    return jsonResponse({ error: "deal_id query parameter required" }, 400);
  }

  if (!env.DEALS_DB) {
    return jsonResponse({ error: "Database not configured" }, 503);
  }

  try {
    const deals = await getSimilarDealsD1(env.DEALS_DB, dealId, {
      limit,
      includeExpired,
    });
    return jsonResponse({ similar: deals, total: deals.length });
  } catch (error) {
    console.error("similar-deals-failed", { dealId, error: String(error) });
    return jsonResponse({ error: "Failed to get similar deals" }, 500);
  }
}

/**
 * Handle recommended deals from D1 - GET /api/d1/recommended?domains=X,Y
 */
async function handleD1Recommended(url: URL, env: Env): Promise<Response> {
  const domainsParam = url.searchParams.get("domains") || "";
  const domains = domainsParam ? domainsParam.split(",") : [];
  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 10;

  if (!env.DEALS_DB) {
    return jsonResponse({ error: "Database not configured" }, 503);
  }

  try {
    const deals = await getRecommendedDealsD1(env.DEALS_DB, domains, { limit });
    return jsonResponse({ recommended: deals, total: deals.length });
  } catch (error) {
    console.error("recommended-deals-failed", { error: String(error) });
    return jsonResponse({ error: "Failed to get recommended deals" }, 500);
  }
}

/**
 * Handle trending deals from D1 - GET /api/d1/trending?days=7
 */
async function handleD1Trending(url: URL, env: Env): Promise<Response> {
  const days = url.searchParams.has("days")
    ? parseInt(url.searchParams.get("days")!, 10)
    : 7;
  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 10;

  if (!env.DEALS_DB) {
    return jsonResponse({ error: "Database not configured" }, 503);
  }

  try {
    const deals = await getTrendingDealsD1(env.DEALS_DB, days, limit);
    return jsonResponse({
      trending: deals,
      total: deals.length,
      period_days: days,
    });
  } catch (error) {
    console.error("trending-deals-failed", { error: String(error) });
    return jsonResponse({ error: "Failed to get trending deals" }, 500);
  }
}
