import { Deal, DealMetadata, PipelineContext, Env } from "../types";
import { CONFIG } from "../config";
import { updateSourceTrust } from "../lib/storage";
import { evolveTrustBatch } from "../lib/d1/trust";
import { mirrorTrustToDO } from "../lib/do-mirror";
import { logger } from "../lib/global-logger";
import { toError } from "../lib/sanitize-error";

// ============================================================================
// Scoring Pipeline
// ============================================================================

interface ScoredDeal extends Deal {
  scores: {
    validity: number;
    uniqueness: number;
    diversity: number;
    trust: number;
    duplicate_penalty: number;
    reward_plausibility: number;
    expiry: number;
  };
}

interface ScoringResult {
  deals: ScoredDeal[];
  stats: {
    avg_confidence: number;
    min_confidence: number;
    max_confidence: number;
    high_value_count: number;
  };
}

/**
 * Calculate confidence and trust scores for all deals
 *
 * Performance: minimizes object churn by mutating in-place and
 * pre-allocating the result array to avoid dynamic resizing.
 */
export async function score(
  deals: Deal[],
  ctx: PipelineContext,
  _env: Env,
): Promise<ScoringResult> {
  const n = deals.length;
  const scoredDeals: ScoredDeal[] = new Array(n);
  let totalConfidence = 0;
  let minConfidence = Infinity;
  let maxConfidence = -Infinity;
  let highValueCount = 0;

  // Pre-calculate shared scores once
  const diversityScore = calculateSourceDiversity(deals);
  const totalCandidates = ctx.candidates.length;
  const duplicateCount = totalCandidates - deals.length;
  const uniquenessScore = calculateUniquenessScore(
    duplicateCount,
    totalCandidates,
  );

  // Pre-calculate duplicate frequency map for O(1) penalty lookup
  const duplicateMap = new Map<string, number>();
  for (const d of deals) {
    const key = `${d.source.domain}:${d.code}`;
    duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
  }

  const weights = CONFIG.SCORING_WEIGHTS;

  let idx = 0;
  for (const deal of deals) {
    const validityScore = 1.0;
    const trustScore = deal.source.trust_score;
    const rewardPlausibility = calculateRewardPlausibility(deal);
    const expiryScore = deal.expiry.confidence;

    const key = `${deal.source.domain}:${deal.code}`;
    const duplicatePenalty =
      (duplicateMap.get(key) || 0) > 1
        ? CONFIG.PLAUSIBILITY_THRESHOLDS.DUPLICATE_PENALTY_VALUE
        : 0.0;

    const confidenceScore =
      validityScore * weights.validity_ratio +
      uniquenessScore * weights.uniqueness_score +
      diversityScore * weights.source_diversity +
      trustScore * weights.historical_trust +
      (1 - duplicatePenalty) * weights.duplicate_penalty +
      rewardPlausibility * weights.reward_plausibility +
      expiryScore * weights.expiry_confidence;

    totalConfidence += confidenceScore;
    if (confidenceScore < minConfidence) minConfidence = confidenceScore;
    if (confidenceScore > maxConfidence) maxConfidence = confidenceScore;

    if (isHighValue(deal)) highValueCount++;

    // Mutate metadata in-place instead of spreading the entire deal
    (deal.metadata as DealMetadata).confidence_score = confidenceScore;

    // Build the ScoredDeal wrapper with minimal allocations
    scoredDeals[idx] = {
      ...deal,
      scores: {
        validity: validityScore,
        uniqueness: uniquenessScore,
        diversity: diversityScore,
        trust: trustScore,
        duplicate_penalty: duplicatePenalty,
        reward_plausibility: rewardPlausibility,
        expiry: expiryScore,
      },
    };
    idx++;
  }

  return {
    deals: scoredDeals,
    stats: {
      avg_confidence: n > 0 ? totalConfidence / n : 0,
      min_confidence: n > 0 ? minConfidence : 0,
      max_confidence: n > 0 ? maxConfidence : 0,
      high_value_count: highValueCount,
    },
  };
}

/**
 * Calculate source diversity score
 */
export function calculateSourceDiversity(deals: Deal[]): number {
  if (deals.length === 0) return 0;

  const domains = new Set(deals.map((d) => d.source.domain));
  const diversity = domains.size / deals.length;
  const optimalRatio = Math.min(
    domains.size / CONFIG.PLAUSIBILITY_THRESHOLDS.OPTIMAL_SOURCE_COUNT,
    1.0,
  );
  return (
    Math.min(
      1.0,
      diversity * CONFIG.PLAUSIBILITY_THRESHOLDS.DIVERSITY_MULTIPLIER,
    ) * optimalRatio
  );
}

/**
 * Calculate uniqueness score
 */
export function calculateUniquenessScore(
  duplicates: number,
  totalCandidates: number,
): number {
  if (totalCandidates === 0) return 1.0;
  return Math.min(1.0, (totalCandidates - duplicates) / totalCandidates);
}

/**
 * Calculate reward plausibility score
 */
function calculateRewardPlausibility(deal: Deal): number {
  const reward = deal.reward;
  const t = CONFIG.PLAUSIBILITY_THRESHOLDS;

  if (reward.type === "cash" && typeof reward.value === "number") {
    if (reward.value === 0) return t.SUSPICIOUS_REWARD_PLAUSIBILITY;
    if (reward.value <= t.CASH_LOW) return 1.0;
    if (reward.value <= t.CASH_MEDIUM) return t.PLAUSIBILITY_MEDIUM;
    if (reward.value <= t.CASH_HIGH) return t.PLAUSIBILITY_HIGH;
    return t.SUSPICIOUS_REWARD_PLAUSIBILITY;
  }

  if (reward.type === "percent" && typeof reward.value === "number") {
    if (
      reward.value >= t.PERCENT_MIN_OPTIMAL &&
      reward.value <= t.PERCENT_MAX_OPTIMAL
    )
      return 1.0;
    if (reward.value > t.PERCENT_MAX_OPTIMAL)
      return t.REWARD_PLAUSIBILITY_DEFAULT;
    if (reward.value >= t.PERCENT_MIN_THRESHOLD) return t.PLAUSIBILITY_MEDIUM;
    return t.PLAUSIBILITY_HIGH;
  }

  if (reward.type === "credit") return t.CREDIT_PLAUSIBILITY;
  if (reward.type === "item") return t.ITEM_PLAUSIBILITY;
  return t.REWARD_PLAUSIBILITY_DEFAULT;
}

/**
 * Check if deal is high value
 */
function isHighValue(deal: Deal): boolean {
  if (deal.reward.type === "cash" && typeof deal.reward.value === "number") {
    return deal.reward.value > CONFIG.HIGH_VALUE_THRESHOLD;
  }
  if (deal.reward.type === "percent" && typeof deal.reward.value === "number") {
    return (
      deal.reward.value > CONFIG.PLAUSIBILITY_THRESHOLDS.PERCENT_MAX_OPTIMAL
    );
  }
  return false;
}

/**
 * Update source trust scores based on validation results
 */
export async function evolveSourceTrust(
  env: Env,
  deals: Deal[],
  allValid: boolean,
): Promise<void> {
  const sources = new Set(deals.map((d) => d.source.domain));
  const domains = Array.from(sources);

  // Prefer D1 atomic batch when available
  if (env.DEALS_DB) {
    try {
      const results = await evolveTrustBatch(
        env.DEALS_DB,
        domains.map((domain) => ({ domain, success: allValid })),
      );
      for (const r of results) {
        logger.info(`Evolved trust for ${r.domain}`, {
          domain: r.domain,
          previous_score: r.previous_score,
          new_score: r.new_score,
          adjustment: r.adjustment,
          allValid,
        });
      }
      // Best-effort SourceRegistry DO mirror (D1 remains canonical)
      await mirrorTrustToDO(
        env,
        new Map(domains.map((domain) => [domain, allValid])),
      );
    } catch (error) {
      const err = toError(error);
      logger.error(`D1 batch trust evolution failed, falling back to KV`, {
        error: err.message,
        domainCount: domains.length,
      });
      await fallbackEvolveTrust(env, domains, allValid).catch((fbErr) => {
        const err = toError(fbErr);
        logger.error(`Fallback KV trust evolution also failed`, {
          error: err.message,
          domainCount: domains.length,
        });
      });
    }
    return;
  }

  // Fallback: KV-based per-domain updates
  await fallbackEvolveTrust(env, domains, allValid).catch((fbErr) => {
    const err = toError(fbErr);
    logger.error(`KV trust evolution failed`, {
      error: err.message,
      domainCount: domains.length,
    });
  });
}

/**
 * KV-based trust evolution fallback used when D1 is unavailable.
 */
async function fallbackEvolveTrust(
  env: Env,
  domains: string[],
  allValid: boolean,
): Promise<void> {
  const adjustment = allValid
    ? CONFIG.TRUST_ADJUSTMENT.success
    : CONFIG.TRUST_ADJUSTMENT.failure;

  const results = await Promise.allSettled(
    domains.map((domain) =>
      updateSourceTrust(env, domain, adjustment).then(() => {
        logger.info(`Evolved trust for ${domain} (KV fallback)`, {
          domain,
          adjustment,
          allValid,
        });
      }),
    ),
  );

  // Log any failures (non-fatal — individual domain errors don't block the batch)
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result && result.status === "rejected") {
      const err = toError(result.reason);
      logger.error(`Failed to evolve trust for ${domains[i]}`, {
        domain: domains[i],
        error: err.message,
      });
    }
  }
}
