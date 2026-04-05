/**
 * D1 Database API Routes - Deal Operations
 *
 * Handles /api/d1/deals, /api/d1/similar, /api/d1/recommended, /api/d1/trending
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { createStructuredLogger } from "../../lib/logger";
import {
  getDealsByDomain,
  getDealsByCategory,
  getActiveDeals,
  getExpiringDeals,
  getSimilarDealsD1,
  getRecommendedDealsD1,
  getTrendingDealsD1,
  type DealSearchResult,
  type ExpiringDeal,
} from "../../lib/d1/queries";

// ============================================================================
// Logger Helper
// ============================================================================

function getD1Logger(env: Env) {
  return createStructuredLogger(env, "d1-routes", `d1-${Date.now()}`);
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
// Similar Deals - GET /api/d1/similar?deal_id=X
// ============================================================================

export async function handleD1Similar(url: URL, env: Env): Promise<Response> {
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

// ============================================================================
// Recommended Deals - GET /api/d1/recommended?domains=X,Y
// ============================================================================

export async function handleD1Recommended(
  url: URL,
  env: Env,
): Promise<Response> {
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

// ============================================================================
// Trending Deals - GET /api/d1/trending?days=7
// ============================================================================

export async function handleD1Trending(url: URL, env: Env): Promise<Response> {
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
