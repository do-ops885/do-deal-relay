/**
 * Core API Routes - Deal Operations
 *
 * Handles /deals, /deals.json, /deals/ranked, /deals/highlights, /deals/similar
 */

import { getProductionSnapshot } from "../../lib/storage";
import type { Env, GetDealsQuery, Deal } from "../../types";
import { GetDealsQuerySchema } from "../../types";
import { jsonResponse } from "../utils";
import {
  calculateDealScore,
  sortDeals,
  rankDeals,
  getTopDeals,
  getExpiringDeals,
  getRecentDeals,
  type SortField,
  type SortOrder,
} from "../../lib/ranking";
import { calculateStringSimilarity } from "../../lib/crypto";

export async function handleGetDeals(url: URL, env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  const query: GetDealsQuery = {
    category: url.searchParams.get("category") || undefined,
    min_reward: url.searchParams.has("min_reward")
      ? parseFloat(url.searchParams.get("min_reward")!)
      : undefined,
    limit: url.searchParams.has("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : 100,
  };

  const validation = GetDealsQuerySchema.safeParse(query);
  if (!validation.success) {
    return jsonResponse({ error: "Invalid query parameters" }, 400);
  }

  let deals = snapshot.deals;
  deals = deals.filter((d) => d.metadata.status === "active");

  if (query.category) {
    deals = deals.filter((d) =>
      d.metadata.category.some(
        (c) => c.toLowerCase() === query.category!.toLowerCase(),
      ),
    );
  }

  if (query.min_reward !== undefined) {
    deals = deals.filter((d) => {
      if (typeof d.reward.value === "number") {
        return d.reward.value >= query.min_reward!;
      }
      return false;
    });
  }

  deals = deals.slice(0, query.limit);

  if (url.pathname === "/deals.json") {
    return jsonResponse({ ...snapshot, deals });
  }

  return jsonResponse(deals);
}

/**
 * Handle similar deals endpoint - GET /deals/similar?code=X
 * Returns deals similar to the given deal code
 */
export async function handleSimilarDeals(
  url: URL,
  env: Env,
): Promise<Response> {
  const code = url.searchParams.get("code");
  const domain = url.searchParams.get("domain");
  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 5;

  if (!code && !domain) {
    return jsonResponse(
      { error: "Either 'code' or 'domain' query parameter required" },
      400,
    );
  }

  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  const targetDeal = snapshot.deals.find(
    (d) => code && d.code.toLowerCase() === code.toLowerCase(),
  );

  if (!targetDeal && domain) {
    const byDomain = snapshot.deals.filter(
      (d) => d.source.domain.toLowerCase() === domain.toLowerCase(),
    );
    if (byDomain.length === 0) {
      return jsonResponse({ error: "No deals found for domain" }, 404);
    }
    return jsonResponse({
      similar: [],
      total: 0,
      reason: "No reference deal found, showing domain deals",
      domain_deals: byDomain.slice(0, limit),
    });
  }

  if (!targetDeal) {
    return jsonResponse({ error: "Deal not found" }, 404);
  }

  const targetCategories = new Set(
    targetDeal.metadata.category.map((c) => c.toLowerCase()),
  );
  const targetTags = new Set(
    targetDeal.metadata.tags.map((t) => t.toLowerCase()),
  );
  const targetDomain = targetDeal.source.domain.toLowerCase();

  const similar = snapshot.deals
    .filter((d) => d.id !== targetDeal.id)
    .map((d) => {
      let score = 0;

      // Category match (weight: 3)
      const dealCategories = new Set(
        d.metadata.category.map((c) => c.toLowerCase()),
      );
      for (const cat of targetCategories) {
        if (dealCategories.has(cat)) score += 3;
      }

      // Domain match (weight: 2)
      if (d.source.domain.toLowerCase() === targetDomain) {
        score += 2;
      }

      // Tag overlap (weight: 1)
      const dealTags = new Set(d.metadata.tags.map((t) => t.toLowerCase()));
      for (const tag of targetTags) {
        if (dealTags.has(tag)) score += 1;
      }

      // Code similarity (weight: 1)
      const codeSim = calculateStringSimilarity(targetDeal.code, d.code);
      score += codeSim;

      return { deal: d, similarity: score };
    })
    .filter((s) => s.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((s) => s.deal);

  return jsonResponse({
    reference: {
      id: targetDeal.id,
      title: targetDeal.title,
      code: targetDeal.code,
      domain: targetDeal.source.domain,
    },
    similar,
    total: similar.length,
  });
}

/**
 * Handle ranked deals endpoint - GET /deals/ranked
 */
export async function handleRankedDeals(url: URL, env: Env): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  // Parse query parameters
  const sortBy = (url.searchParams.get("sort_by") || "confidence") as SortField;
  const order = (url.searchParams.get("order") || "desc") as SortOrder;
  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 50;
  const minConfidence = url.searchParams.has("min_confidence")
    ? parseFloat(url.searchParams.get("min_confidence")!)
    : undefined;
  const minTrustScore = url.searchParams.has("min_trust")
    ? parseFloat(url.searchParams.get("min_trust")!)
    : undefined;
  const category = url.searchParams.get("category") || undefined;
  const includeScores = url.searchParams.get("include_scores") === "true";

  // Rank deals
  const result = rankDeals(snapshot.deals, {
    sortBy,
    order,
    limit,
    minConfidence,
    minTrustScore,
    category,
  });

  const response: Record<string, unknown> = {
    deals: result.deals,
    meta: {
      total: result.total,
      filtered: result.filtered,
      returned: result.deals.length,
      sort_by: sortBy,
      order: order,
    },
  };

  if (includeScores) {
    response.scores = result.scores;
  }

  return jsonResponse(response);
}

/**
 * Handle deal highlights endpoint - GET /deals/highlights
 */
export async function handleDealHighlights(
  url: URL,
  env: Env,
): Promise<Response> {
  const snapshot = await getProductionSnapshot(env);

  if (!snapshot) {
    return jsonResponse({ error: "No deals available" }, 404);
  }

  const limit = url.searchParams.has("limit")
    ? parseInt(url.searchParams.get("limit")!, 10)
    : 5;

  const topDeals = getTopDeals(snapshot.deals, limit);
  const expiringSoon = getExpiringDeals(snapshot.deals, 7);
  const recentlyAdded = getRecentDeals(snapshot.deals, 7);

  return jsonResponse({
    top_deals: topDeals,
    expiring_soon: expiringSoon,
    recently_added: recentlyAdded,
    meta: {
      top_deals_count: topDeals.length,
      expiring_soon_count: expiringSoon.length,
      recently_added_count: recentlyAdded.length,
    },
  });
}
