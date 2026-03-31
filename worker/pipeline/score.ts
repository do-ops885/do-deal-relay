import { Deal, PipelineContext } from '../types';
import { CONFIG } from '../config';
import { getProductionSnapshot } from '../lib/storage';
import type { Env } from '../types';

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
 */
export async function score(
  deals: Deal[],
  ctx: PipelineContext,
  env: Env
): Promise<ScoringResult> {
  const scoredDeals: ScoredDeal[] = [];
  let totalConfidence = 0;
  let minConfidence = Infinity;
  let maxConfidence = -Infinity;
  let highValueCount = 0;

  // Get production deals for diversity calculation
  const prodSnapshot = await getProductionSnapshot(env);
  const allDeals = [...(prodSnapshot?.deals || []), ...deals];

  // Calculate source diversity
  const diversityScore = calculateSourceDiversity(deals);

  // Calculate uniqueness from deduplication phase
  const totalCandidates = ctx.candidates.length;
  const duplicateCount = totalCandidates - deals.length;
  const uniquenessScore = calculateUniquenessScore(duplicateCount, totalCandidates);

  for (const deal of deals) {
    // Calculate individual scores
    const validityScore = 1.0; // Already passed validation
    const trustScore = deal.source.trust_score;
    const rewardPlausibility = calculateRewardPlausibility(deal);
    const expiryScore = deal.expiry.confidence;

    // Calculate duplicate penalty
    const duplicatePenalty = calculateDuplicatePenalty(deal, ctx);

    // Calculate final confidence score
    const weights = CONFIG.SCORING_WEIGHTS;
    const confidenceScore =
      validityScore * weights.validity_ratio +
      uniquenessScore * weights.uniqueness_score +
      diversityScore * weights.source_diversity +
      trustScore * weights.historical_trust +
      (1 - duplicatePenalty) * weights.duplicate_penalty +
      rewardPlausibility * weights.reward_plausibility +
      expiryScore * weights.expiry_confidence;

    // Track stats
    totalConfidence += confidenceScore;
    minConfidence = Math.min(minConfidence, confidenceScore);
    maxConfidence = Math.max(maxConfidence, confidenceScore);

    // Check if high value
    if (isHighValue(deal)) {
      highValueCount++;
    }

    // Create scored deal
    const scoredDeal: ScoredDeal = {
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
      metadata: {
        ...deal.metadata,
        confidence_score: confidenceScore,
      },
    };

    scoredDeals.push(scoredDeal);
  }

  return {
    deals: scoredDeals,
    stats: {
      avg_confidence: deals.length > 0 ? totalConfidence / deals.length : 0,
      min_confidence: deals.length > 0 ? minConfidence : 0,
      max_confidence: deals.length > 0 ? maxConfidence : 0,
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

  // Reward having deals from multiple sources
  // Max score at ~5 different domains for 10 deals (ratio = 0.5)
  const optimalRatio = Math.min(domains.size / 5, 1.0);

  // Combined score: diversity * optimal ratio
  return Math.min(1.0, diversity * 2) * optimalRatio;
}

/**
 * Calculate uniqueness score
 */
export function calculateUniquenessScore(
  duplicates: number,
  totalCandidates: number
): number {
  if (totalCandidates === 0) return 1.0;
  const uniqueRatio = (totalCandidates - duplicates) / totalCandidates;
  return Math.min(1.0, uniqueRatio);
}

/**
 * Calculate reward plausibility score
 */
function calculateRewardPlausibility(deal: Deal): number {
  const reward = deal.reward;

  // Cash rewards: lower is more plausible (except 0)
  if (reward.type === 'cash' && typeof reward.value === 'number') {
    if (reward.value === 0) return 0.5; // Suspicious but possible
    if (reward.value <= 50) return 1.0;
    if (reward.value <= 100) return 0.9;
    if (reward.value <= 500) return 0.7;
    return 0.5; // Very high, suspicious
  }

  // Percent rewards: 10-50% is most plausible
  if (reward.type === 'percent' && typeof reward.value === 'number') {
    if (reward.value >= 10 && reward.value <= 50) return 1.0;
    if (reward.value > 50) return 0.8;
    if (reward.value >= 5) return 0.9;
    return 0.7; // Very low percent
  }

  // Credit: usually reasonable
  if (reward.type === 'credit') return 0.9;

  // Item: hard to assess
  if (reward.type === 'item') return 0.8;

  return 0.8;
}

/**
 * Calculate duplicate penalty for a deal
 */
function calculateDuplicatePenalty(deal: Deal, ctx: PipelineContext): number {
  // Check if similar deal exists in this batch
  const similarInBatch = ctx.deduped.filter(
    (d) =>
      d.id !== deal.id &&
      d.source.domain === deal.source.domain &&
      d.code === deal.code
  );

  if (similarInBatch.length > 0) {
    return 0.5; // Penalty for duplicates
  }

  return 0.0;
}

/**
 * Check if deal is high value
 */
function isHighValue(deal: Deal): boolean {
  if (deal.reward.type === 'cash' && typeof deal.reward.value === 'number') {
    return deal.reward.value > CONFIG.HIGH_VALUE_THRESHOLD;
  }

  if (deal.reward.type === 'percent' && typeof deal.reward.value === 'number') {
    return deal.reward.value > 50;
  }

  return false;
}

/**
 * Update source trust scores based on validation
 */
export async function evolveSourceTrust(
  env: Env,
  deals: Deal[],
  allValid: boolean
): Promise<void> {
  const { DEFAULT_SOURCES } = await import('../config');
  const adjustment = allValid
    ? CONFIG.TRUST_ADJUSTMENT.success
    : CONFIG.TRUST_ADJUSTMENT.failure;

  // This would update the source registry
  // Implementation depends on storage layer
  console.log(`Evolving trust: adjustment=${adjustment}, allValid=${allValid}`);
}
