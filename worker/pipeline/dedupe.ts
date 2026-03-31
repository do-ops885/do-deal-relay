import { Deal, PipelineContext } from "../types";
import { CONFIG } from "../config";
import {
  calculateUrlSimilarity,
  calculateStringSimilarity,
} from "../lib/crypto";

// ============================================================================
// Deduplication Pipeline
// ============================================================================

interface DedupeResult {
  unique: Deal[];
  duplicates: Array<{
    deal: Deal;
    matched_with: string;
    reason: string;
  }>;
}

/**
 * Deduplicate deals using multiple strategies
 */
export function deduplicate(
  deals: Deal[],
  ctx: PipelineContext,
  existingDeals?: Deal[],
): DedupeResult {
  const result: DedupeResult = {
    unique: [],
    duplicates: [],
  };

  const seenIds = new Set<string>();
  const seenCodes = new Map<string, Deal>(); // domain:code -> deal
  const seenUrls = new Map<string, Deal>(); // normalized url -> deal

  // First pass: syntactic dedupe (exact matches)
  for (const deal of deals) {
    // Check ID uniqueness
    if (seenIds.has(deal.id)) {
      result.duplicates.push({
        deal,
        matched_with: deal.id,
        reason: "duplicate_id",
      });
      continue;
    }
    seenIds.add(deal.id);

    // Check code uniqueness per domain
    const codeKey = `${deal.source.domain}:${deal.code}`;
    if (seenCodes.has(codeKey)) {
      const existing = seenCodes.get(codeKey)!;
      result.duplicates.push({
        deal,
        matched_with: existing.id,
        reason: "duplicate_code",
      });
      continue;
    }
    seenCodes.set(codeKey, deal);

    // Check URL uniqueness (exact)
    if (seenUrls.has(deal.url)) {
      const existing = seenUrls.get(deal.url)!;
      result.duplicates.push({
        deal,
        matched_with: existing.id,
        reason: "duplicate_url",
      });
      continue;
    }
    seenUrls.set(deal.url, deal);

    result.unique.push(deal);
  }

  // Second pass: semantic dedupe (similar URLs)
  const semanticUnique: Deal[] = [];
  const semanticUrls = new Map<string, Deal>();

  for (const deal of result.unique) {
    let isDuplicate = false;
    let matchedWith = "";

    for (const [url, existing] of semanticUrls) {
      const similarity = calculateUrlSimilarity(deal.url, url);
      if (similarity >= CONFIG.SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        matchedWith = existing.id;
        break;
      }
    }

    if (isDuplicate) {
      result.duplicates.push({
        deal,
        matched_with: matchedWith,
        reason: "semantic_url_similarity",
      });
    } else {
      semanticUrls.set(deal.url, deal);
      semanticUnique.push(deal);
    }
  }

  result.unique = semanticUnique;

  // Third pass: cross-source dedupe (same deal from different sources)
  const crossSourceUnique: Deal[] = [];
  const crossSourceKeys = new Map<string, Deal>();

  for (const deal of result.unique) {
    // Create a key based on normalized deal characteristics
    const key = createCrossSourceKey(deal);
    const existing = crossSourceKeys.get(key);

    if (existing) {
      // Prefer the one with higher trust score
      if (deal.source.trust_score > existing.source.trust_score) {
        // Replace with higher trust version
        const index = crossSourceUnique.indexOf(existing);
        if (index !== -1) {
          result.duplicates.push({
            deal: existing,
            matched_with: deal.id,
            reason: "cross_source_lower_trust",
          });
          crossSourceUnique[index] = deal;
          crossSourceKeys.set(key, deal);
        }
      } else {
        result.duplicates.push({
          deal,
          matched_with: existing.id,
          reason: "cross_source_duplicate",
        });
      }
    } else {
      crossSourceKeys.set(key, deal);
      crossSourceUnique.push(deal);
    }
  }

  result.unique = crossSourceUnique;

  // Fourth pass: dedupe against existing production deals
  if (existingDeals && existingDeals.length > 0) {
    const finalUnique: Deal[] = [];

    for (const deal of result.unique) {
      let isDuplicate = false;
      let matchedWith = "";

      for (const existing of existingDeals) {
        // Exact ID match
        if (existing.id === deal.id) {
          isDuplicate = true;
          matchedWith = existing.id;
          break;
        }

        // Same code from same domain
        if (
          existing.source.domain === deal.source.domain &&
          existing.code === deal.code
        ) {
          isDuplicate = true;
          matchedWith = existing.id;
          break;
        }

        // Semantic URL match
        const urlSim = calculateUrlSimilarity(existing.url, deal.url);
        if (urlSim >= CONFIG.SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          matchedWith = existing.id;
          break;
        }
      }

      if (isDuplicate) {
        result.duplicates.push({
          deal,
          matched_with: matchedWith,
          reason: "existing_production_duplicate",
        });
      } else {
        finalUnique.push(deal);
      }
    }

    result.unique = finalUnique;
  }

  return result;
}

/**
 * Create a key for cross-source deduplication
 */
function createCrossSourceKey(deal: Deal): string {
  // Normalize title and reward for comparison
  const normalizedTitle = deal.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rewardKey = `${deal.reward.type}:${deal.reward.value}`;

  return `${normalizedTitle}:${deal.code}:${rewardKey}`;
}

/**
 * Calculate uniqueness score
 */
export function calculateUniquenessScore(
  duplicateCount: number,
  totalCandidates: number,
): number {
  if (totalCandidates === 0) return 1.0;
  const uniqueRatio = (totalCandidates - duplicateCount) / totalCandidates;
  return Math.min(1.0, uniqueRatio);
}

/**
 * Calculate source diversity score
 */
export function calculateSourceDiversity(deals: Deal[]): number {
  if (deals.length === 0) return 0;

  const domains = new Set(deals.map((d) => d.source.domain));
  const diversity = domains.size / deals.length;

  // Reward having deals from multiple sources
  // Max score at ~5 different domains for 10 deals
  const optimalRatio = Math.min(domains.size / 5, 1.0);

  return Math.min(1.0, diversity * 2) * optimalRatio;
}
