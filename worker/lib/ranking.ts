// ============================================================================
// Deal Ranking - Rank deals by various criteria
// ============================================================================

import type { Deal } from "../types";

export type SortField = "confidence" | "recency" | "value" | "expiry" | "trust";
export type SortOrder = "asc" | "desc";

export interface RankOptions {
  sortBy: SortField;
  order: SortOrder;
  limit?: number;
  minConfidence?: number;
  minTrustScore?: number;
  category?: string;
}

/**
 * Calculate detailed deal score with breakdown
 * Performance optimization: Single pass for both total and breakdown
 */
export function calculateDetailedScore(deal: Deal): {
  score: number;
  breakdown: Record<string, number>;
} {
  const breakdown = {
    confidence: deal.metadata.confidence_score * 100,
    trust: deal.source.trust_score * 100,
    recency: calculateRecencyScore(deal.source.discovered_at),
    value: calculateValueScore(deal.reward),
    expiry: calculateExpiryScore(deal.expiry.date),
  };

  // Weighted composite score
  // Performance optimization: Direct summation avoids Object.entries() and reduce() allocations
  const score =
    breakdown.confidence * 0.25 +
    breakdown.trust * 0.2 +
    breakdown.recency * 0.2 +
    breakdown.value * 0.2 +
    breakdown.expiry * 0.15;

  return { score, breakdown };
}

/**
 * Calculate deal score for ranking
 * Composite score based on multiple factors
 */
export function calculateDealScore(deal: Deal): number {
  return calculateDetailedScore(deal).score;
}

/**
 * Calculate recency score (0-100)
 * More recent = higher score, decays over time
 */
function calculateRecencyScore(discoveredAt: string): number {
  const discovered = new Date(discoveredAt).getTime();
  const now = Date.now();
  const ageDays = (now - discovered) / (1000 * 60 * 60 * 24);

  // Score decays exponentially: 100 at day 0, ~37 at day 30, ~14 at day 60
  return Math.max(0, Math.min(100, 100 * Math.exp(-ageDays / 30)));
}

/**
 * Calculate value score (0-100)
 * Based on reward value and type
 */
function calculateValueScore(reward: Deal["reward"]): number {
  let baseValue = 0;

  if (typeof reward.value === "number") {
    baseValue = reward.value;
  } else if (typeof reward.value === "string") {
    // Try to extract numeric value
    const numeric = parseFloat(reward.value.replace(/[^0-9.]/g, ""));
    if (!isNaN(numeric)) {
      baseValue = numeric;
    }
  }

  // Normalize to 0-100 scale (assuming $500 is max expected value)
  const normalizedValue = Math.min(100, (baseValue / 500) * 100);

  // Bonus for cash rewards
  const typeMultiplier =
    reward.type === "cash" ? 1.2 : reward.type === "percent" ? 1.1 : 1.0;

  return Math.min(100, normalizedValue * typeMultiplier);
}

/**
 * Calculate expiry score (0-100)
 * Higher for deals with more time remaining
 */
function calculateExpiryScore(expiryDate: string | undefined): number {
  if (!expiryDate) {
    return 50; // Neutral score for unknown expiry
  }

  const expiry = new Date(expiryDate).getTime();
  const now = Date.now();
  const daysUntil = (expiry - now) / (1000 * 60 * 60 * 24);

  if (daysUntil < 0) {
    return 0; // Already expired
  }

  if (daysUntil > 90) {
    return 100; // Plenty of time
  }

  // Linear scale: 100 at 90 days, 0 at 0 days
  return Math.max(0, (daysUntil / 90) * 100);
}

/**
 * Sort deals by specified field
 */
export function sortDeals(
  deals: Deal[],
  sortBy: SortField,
  order: SortOrder = "desc",
): Deal[] {
  const sorted = [...deals];

  const compareFn = (a: Deal, b: Deal): number => {
    let comparison = 0;

    switch (sortBy) {
      case "confidence":
        comparison = a.metadata.confidence_score - b.metadata.confidence_score;
        break;
      case "recency":
        comparison =
          new Date(a.source.discovered_at).getTime() -
          new Date(b.source.discovered_at).getTime();
        break;
      case "value":
        comparison = getNumericValue(a.reward) - getNumericValue(b.reward);
        break;
      case "expiry":
        comparison = compareExpiry(a.expiry.date, b.expiry.date);
        break;
      case "trust":
        comparison = a.source.trust_score - b.source.trust_score;
        break;
      default:
        // Default to composite score
        comparison = calculateDealScore(a) - calculateDealScore(b);
    }

    return order === "desc" ? -comparison : comparison;
  };

  return sorted.sort(compareFn);
}

/**
 * Get numeric value from reward
 */
function getNumericValue(reward: Deal["reward"]): number {
  if (typeof reward.value === "number") {
    return reward.value;
  }
  if (typeof reward.value === "string") {
    const numeric = parseFloat(reward.value.replace(/[^0-9.]/g, ""));
    return isNaN(numeric) ? 0 : numeric;
  }
  return 0;
}

/**
 * Compare two expiry dates
 */
function compareExpiry(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1; // No expiry = "later" (for sorting)
  if (!b) return -1;

  return new Date(a).getTime() - new Date(b).getTime();
}

/**
 * Rank and filter deals
 */
export function rankDeals(
  deals: Deal[],
  options: RankOptions,
): {
  deals: Deal[];
  total: number;
  filtered: number;
  scores?: Array<{
    dealId: string;
    score: number;
    breakdown: Record<string, number>;
  }>;
} {
  // Filter first
  let filtered = deals.filter((d) => d.metadata.status === "active");

  if (options.minConfidence !== undefined) {
    filtered = filtered.filter(
      (d) => d.metadata.confidence_score >= options.minConfidence!,
    );
  }

  if (options.minTrustScore !== undefined) {
    filtered = filtered.filter(
      (d) => d.source.trust_score >= options.minTrustScore!,
    );
  }

  if (options.category) {
    filtered = filtered.filter((d) =>
      d.metadata.category.some(
        (c) => c.toLowerCase() === options.category!.toLowerCase(),
      ),
    );
  }

  const total = deals.length;
  const filteredCount = filtered.length;

  // Sort
  const sorted = sortDeals(filtered, options.sortBy, options.order);

  // Calculate scores with breakdown
  // Performance optimization: Use calculateDetailedScore to avoid doubling component calculations
  const scores = sorted.map((deal) => {
    const { score, breakdown } = calculateDetailedScore(deal);
    return {
      dealId: deal.id,
      score,
      breakdown,
    };
  });

  // Apply limit
  const limited = options.limit ? sorted.slice(0, options.limit) : sorted;

  return {
    deals: limited,
    total,
    filtered: filteredCount,
    scores,
  };
}

/**
 * Get top deals by composite score
 */
export function getTopDeals(deals: Deal[], limit: number = 10): Deal[] {
  const withScores = deals.map((deal) => ({
    deal,
    score: calculateDealScore(deal),
  }));

  return withScores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ deal }) => deal);
}

/**
 * Get deals expiring soon (within specified days)
 */
export function getExpiringDeals(deals: Deal[], days: number = 7): Deal[] {
  const now = Date.now();
  const cutoff = now + days * 24 * 60 * 60 * 1000;

  return deals
    .filter((d) => {
      if (!d.expiry.date) return false;
      const expiry = new Date(d.expiry.date).getTime();
      return expiry > now && expiry <= cutoff;
    })
    .sort(
      (a, b) =>
        new Date(a.expiry.date!).getTime() - new Date(b.expiry.date!).getTime(),
    );
}

/**
 * Get recently added deals (within specified days)
 */
export function getRecentDeals(deals: Deal[], days: number = 7): Deal[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return deals
    .filter((d) => new Date(d.source.discovered_at).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.source.discovered_at).getTime() -
        new Date(a.source.discovered_at).getTime(),
    );
}

/**
 * Get high value deals (above threshold)
 */
export function getHighValueDeals(
  deals: Deal[],
  threshold: number = 50,
): Deal[] {
  return deals
    .filter((d) => {
      const value = typeof d.reward.value === "number" ? d.reward.value : 0;
      return value >= threshold;
    })
    .sort((a, b) => {
      const aVal = typeof a.reward.value === "number" ? a.reward.value : 0;
      const bVal = typeof b.reward.value === "number" ? b.reward.value : 0;
      return bVal - aVal;
    });
}
