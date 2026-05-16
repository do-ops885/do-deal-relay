import { Deal, PipelineContext } from "../types";
import { CONFIG } from "../config";
import { calculateUrlSimilarity } from "../lib/crypto";

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
 * Pre-compute a normalized URL key once, so repeated O(n²) comparisons
 * avoid re-parsing the same URL.
 */
function precomputeUrlKey(url: string): URL | string {
  try {
    return new URL(url);
  } catch {
    return url;
  }
}

/**
 * Build a partition key that groups similar deals into tighter buckets.
 * Combines domain + reward type + reward value tier to reduce comparison scope.
 */
function buildPartitionKey(deal: Deal): string {
  const domain = deal.source.domain;
  const rewardType = deal.reward.type;
  // Bucket reward values into tiers to avoid splitting near-identical values
  let valueTier: string;
  if (typeof deal.reward.value === "number") {
    if (deal.reward.value <= 25) valueTier = "low";
    else if (deal.reward.value <= 100) valueTier = "medium";
    else if (deal.reward.value <= 500) valueTier = "high";
    else valueTier = "very_high";
  } else {
    valueTier = "unknown";
  }
  return `${domain}:${rewardType}:${valueTier}`;
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
  const seenCodes = new Map<string, Deal>();
  const seenUrls = new Map<string, Deal>();

  // First pass: syntactic dedupe (exact matches)
  for (const deal of deals) {
    if (seenIds.has(deal.id)) {
      result.duplicates.push({
        deal,
        matched_with: deal.id,
        reason: "duplicate_id",
      });
      continue;
    }
    seenIds.add(deal.id);

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

  // Second pass: semantic dedupe (similar URLs) with pre-partitioning
  // Partition the unique deals into smaller buckets by domain + reward type + value tier
  // This reduces the O(n²) comparison space significantly.
  const partitions = new Map<
    string,
    Array<{ deal: Deal; url: URL | string }>
  >();

  for (const deal of result.unique) {
    const pkey = buildPartitionKey(deal);
    if (!partitions.has(pkey)) {
      partitions.set(pkey, []);
    }
    partitions.get(pkey)!.push({ deal, url: precomputeUrlKey(deal.url) });
  }

  const semanticUnique: Deal[] = [];
  for (const [, bucket] of partitions) {
    const bucketUnique: Deal[] = [];
    for (const entry of bucket) {
      let isDuplicate = false;
      let matchedWith = "";
      for (const existing of bucketUnique) {
        const sim = calculateUrlSimilarity(entry.url, existing.url);
        if (sim >= CONFIG.SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          matchedWith = existing.id;
          break;
        }
      }
      if (isDuplicate) {
        result.duplicates.push({
          deal: entry.deal,
          matched_with: matchedWith,
          reason: "semantic_url_similarity",
        });
      } else {
        bucketUnique.push(entry.deal);
        semanticUnique.push(entry.deal);
      }
    }
  }
  result.unique = semanticUnique;

  // Third pass: cross-source dedupe (same deal from different sources)
  const crossSourceUnique: Deal[] = [];
  const crossSourceKeys = new Map<string, Deal>();

  for (const deal of result.unique) {
    const key = createCrossSourceKey(deal);
    const existing = crossSourceKeys.get(key);

    if (existing) {
      if (deal.source.trust_score > existing.source.trust_score) {
        const idx = crossSourceUnique.indexOf(existing);
        if (idx !== -1) {
          result.duplicates.push({
            deal: existing,
            matched_with: deal.id,
            reason: "cross_source_lower_trust",
          });
          crossSourceUnique[idx] = deal;
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
    const existingWithKeys = new Map<
      string,
      Array<{ deal: Deal; url: URL | string }>
    >();
    for (const d of existingDeals) {
      const pkey = buildPartitionKey(d);
      if (!existingWithKeys.has(pkey)) {
        existingWithKeys.set(pkey, []);
      }
      existingWithKeys
        .get(pkey)!
        .push({ deal: d, url: precomputeUrlKey(d.url) });
    }

    const finalUnique: Deal[] = [];
    for (const deal of result.unique) {
      let isDuplicate = false;
      let matchedWith = "";
      const pkey = buildPartitionKey(deal);
      const existingInBucket = existingWithKeys.get(pkey) || [];

      if (existingInBucket.length > 0) {
        const dealUrlObj = precomputeUrlKey(deal.url);
        for (const existing of existingInBucket) {
          if (
            existing.deal.id === deal.id ||
            existing.deal.code === deal.code
          ) {
            isDuplicate = true;
            matchedWith = existing.deal.id;
            break;
          }
          const urlSim = calculateUrlSimilarity(existing.url, dealUrlObj);
          if (urlSim >= CONFIG.SIMILARITY_THRESHOLD) {
            isDuplicate = true;
            matchedWith = existing.deal.id;
            break;
          }
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
  const normalizedTitle = deal.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rewardKey = `${deal.reward.type}:${deal.reward.value}`;
  return `${normalizedTitle}:${deal.code}:${rewardKey}`;
}
