import type { Deal } from "../types";

// ============================================================================
// Ranking Types
// ============================================================================

export interface RankingOptions {
  sortBy: "confidence" | "value" | "recency" | "trust" | "expiry";
  order: "asc" | "desc";
  category?: string;
  minConfidence?: number;
  maxAge?: number; // days
}

export interface RankingInfo {
  score: number; // composite ranking score
  position: number;
  tier: "top" | "good" | "average" | "low";
}

export interface RankedDeal extends Deal {
  ranking: RankingInfo;
}

// ============================================================================
// Composite Ranking Algorithm
// ============================================================================

// score = (confidence_score * 0.4) +
//         (normalized_value * 0.25) +
//         (recency_score * 0.2) +
//         (trust_score * 0.15)
// Then sort by score descending

const COMPOSITE_WEIGHTS = {
  confidence: 0.4,
  value: 0.25,
  recency: 0.2,
  trust: 0.15,
} as const;

/**
 * Calculate recency score for a deal
 * Returns 1.0 for deals discovered just now, 0.0 for deals older than maxAge days
 */
export function calculateRecencyScore(
  deal: Deal,
  maxAgeDays: number = 30,
): number {
  const discoveredAt = new Date(deal.source.discovered_at).getTime();
  const now = Date.now();
  const ageMs = now - discoveredAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 0) return 1.0;
  if (ageDays >= maxAgeDays) return 0.0;

  // Linear decay from 1.0 to 0.0 over maxAgeDays
  return 1.0 - ageDays / maxAgeDays;
}

/**
 * Calculate normalized value score for a deal
 * Normalizes cash and percent rewards to 0-1 scale
 */
export function calculateValueScore(deal: Deal): number {
  const { reward } = deal;

  // Handle item rewards (non-numeric values are valid for items)
  if (reward.type === "item") {
    return 0.6;
  }

  if (typeof reward.value !== "number") {
    return 0.5; // Default for non-numeric values
  }

  switch (reward.type) {
    case "cash":
      // Normalize: $0 = 0, $500 = 1.0 (capped)
      return Math.min(reward.value / 500, 1.0);

    case "percent":
      // Normalize: 0% = 0, 100% = 1.0
      return Math.min(reward.value / 100, 1.0);

    case "credit":
      // Similar to cash but slightly lower base
      return Math.min((reward.value || 0) / 500, 1.0) * 0.9;

    default:
      return 0.5;
  }
}

/**
 * Calculate trust score component
 */
export function calculateTrustScore(deal: Deal): number {
  return deal.source.trust_score;
}

/**
 * Calculate confidence score component
 */
export function calculateConfidenceScore(deal: Deal): number {
  return deal.metadata.confidence_score;
}

/**
 * Calculate composite ranking score for a deal
 */
export function calculateCompositeScore(
  deal: Deal,
  maxAgeDays: number = 30,
): number {
  const confidence = calculateConfidenceScore(deal);
  const value = calculateValueScore(deal);
  const recency = calculateRecencyScore(deal, maxAgeDays);
  const trust = calculateTrustScore(deal);

  return (
    confidence * COMPOSITE_WEIGHTS.confidence +
    value * COMPOSITE_WEIGHTS.value +
    recency * COMPOSITE_WEIGHTS.recency +
    trust * COMPOSITE_WEIGHTS.trust
  );
}

/**
 * Determine tier based on score percentile
 */
function determineTier(position: number, total: number): RankingInfo["tier"] {
  // position is 1-indexed, convert to 0-indexed percentile
  // position 1 = 0% (best), position N = ~100% (worst)
  const percentile = (position - 1) / total;

  if (percentile < 0.1) return "top"; // Top 10%
  if (percentile < 0.3) return "good"; // Top 30%
  if (percentile < 0.7) return "average"; // Middle 40%
  return "low"; // Bottom 30%
}

/**
 * Rank deals based on the provided options
 */
export function rankDeals(
  deals: Deal[],
  options: RankingOptions,
): RankedDeal[] {
  // Filter by category if specified
  let filteredDeals = deals;
  if (options.category) {
    filteredDeals = deals.filter((d) =>
      d.metadata.category.some(
        (c) => c.toLowerCase() === options.category!.toLowerCase(),
      ),
    );
  }

  // Filter by minimum confidence if specified
  if (options.minConfidence !== undefined) {
    filteredDeals = filteredDeals.filter(
      (d) => d.metadata.confidence_score >= options.minConfidence!,
    );
  }

  // Filter by max age if specified
  if (options.maxAge !== undefined) {
    const maxAgeMs = options.maxAge * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAgeMs;
    filteredDeals = filteredDeals.filter(
      (d) => new Date(d.source.discovered_at).getTime() >= cutoffTime,
    );
  }

  // Calculate scores based on sort criteria
  const scoredDeals = filteredDeals.map((deal) => {
    let score: number;

    switch (options.sortBy) {
      case "confidence":
        score = calculateConfidenceScore(deal);
        break;
      case "value":
        score = calculateValueScore(deal);
        break;
      case "recency":
        score = calculateRecencyScore(deal, options.maxAge || 30);
        break;
      case "trust":
        score = calculateTrustScore(deal);
        break;
      case "expiry":
        score = deal.expiry.confidence;
        break;
      default:
        score = calculateCompositeScore(deal, options.maxAge || 30);
    }

    return { deal, score };
  });

  // Sort by score
  scoredDeals.sort((a, b) => {
    if (options.order === "asc") {
      return a.score - b.score;
    }
    return b.score - a.score;
  });

  // Assign positions and tiers
  const total = scoredDeals.length;
  const rankedDeals: RankedDeal[] = scoredDeals.map((item, index) => {
    const position = index + 1;
    return {
      ...item.deal,
      ranking: {
        score: item.score,
        position,
        tier: determineTier(position, total),
      },
    };
  });

  return rankedDeals;
}

/**
 * Get the top N deals by composite score
 */
export function getTopDeals(
  deals: Deal[],
  count: number = 10,
  minConfidence?: number,
): RankedDeal[] {
  const options: RankingOptions = {
    sortBy: "confidence",
    order: "desc",
    minConfidence,
  };

  const ranked = rankDeals(deals, options);
  return ranked.slice(0, count);
}

/**
 * Get deals by tier
 */
export function getDealsByTier(
  deals: Deal[],
  tier: RankingInfo["tier"],
  options?: Partial<Omit<RankingOptions, "sortBy" | "order">>,
): RankedDeal[] {
  const rankingOptions: RankingOptions = {
    sortBy: "confidence",
    order: "desc",
    ...options,
  };

  const ranked = rankDeals(deals, rankingOptions);
  return ranked.filter((d) => d.ranking.tier === tier);
}
