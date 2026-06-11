import { Deal, PipelineContext } from "../types";
import { CONFIG } from "../config";
import { calculateUrlSimilarity } from "../lib/crypto";

// ============================================================================
// Constants
// ============================================================================

const REWARD_TIER_LOW = 25;
const REWARD_TIER_MEDIUM = 100;
const REWARD_TIER_HIGH = 500;

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
    if (deal.reward.value <= REWARD_TIER_LOW) valueTier = "low";
    else if (deal.reward.value <= REWARD_TIER_MEDIUM) valueTier = "medium";
    else if (deal.reward.value <= REWARD_TIER_HIGH) valueTier = "high";
    else valueTier = "very_high";
  } else {
    valueTier = "unknown";
  }
  return `${domain}:${rewardType}:${valueTier}`;
}

/**
 * Pre-compute partition keys and URL keys for an array of deals.
 * Returns two Maps to avoid re-computing keys across multiple passes.
 */
function precomputeDealKeys(deals: Deal[]): {
  partitionKeys: Map<Deal, string>;
  urlKeys: Map<Deal, URL | string>;
} {
  const partitionKeys = new Map<Deal, string>();
  const urlKeys = new Map<Deal, URL | string>();
  for (const deal of deals) {
    partitionKeys.set(deal, buildPartitionKey(deal));
    urlKeys.set(deal, precomputeUrlKey(deal.url));
  }
  return { partitionKeys, urlKeys };
}

/**
 * Partition deals into buckets by their pre-computed partition key.
 * Returns both the bucket map and the ordered list for iteration.
 */
function partitionByKey(
  items: Array<{ deal: Deal; url: URL | string }>,
  partitionKeys: Map<Deal, string>,
): Map<string, Array<{ deal: Deal; url: URL | string }>> {
  const partitions = new Map<
    string,
    Array<{ deal: Deal; url: URL | string }>
  >();
  for (const item of items) {
    const pkey = partitionKeys.get(item.deal) || "";
    if (!partitions.has(pkey)) {
      partitions.set(pkey, []);
    }
    partitions.get(pkey)?.push(item);
  }
  return partitions;
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

  // Pre-compute all keys once for the unique deals (used across all passes)
  const { partitionKeys: uniquePartitionKeys, urlKeys: uniqueUrlKeys } =
    precomputeDealKeys(result.unique);

  // Second pass: semantic dedupe (similar URLs) with pre-partitioning
  // Partition the unique deals into smaller buckets by pre-computed keys
  const uniqueWithKeys = result.unique.map((deal) => ({
    deal,
    url: uniqueUrlKeys.get(deal) || precomputeUrlKey(deal.url),
  }));
  const partitions = partitionByKey(uniqueWithKeys, uniquePartitionKeys);

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

  // Pre-compute cross-source keys for the semantic unique deals
  const crossSourceKeys = new Map<string, Deal>();
  const crossSourceIndex = new Map<Deal, number>();
  const crossSourceUnique: Deal[] = [];

  for (const deal of result.unique) {
    const key = createCrossSourceKey(deal);
    const existing = crossSourceKeys.get(key);

    if (existing) {
      if (deal.source.trust_score > existing.source.trust_score) {
        const idx = crossSourceIndex.get(existing);
        if (idx !== undefined) {
          result.duplicates.push({
            deal: existing,
            matched_with: deal.id,
            reason: "cross_source_lower_trust",
          });
          crossSourceUnique[idx] = deal;
          crossSourceKeys.set(key, deal);
          crossSourceIndex.set(deal, idx);
          crossSourceIndex.delete(existing);
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
      crossSourceIndex.set(deal, crossSourceUnique.length);
      crossSourceUnique.push(deal);
    }
  }
  result.unique = crossSourceUnique;

  // Fourth pass: dedupe against existing production deals
  if (existingDeals && existingDeals.length > 0) {
    // Pre-compute keys for existing deals and partition into buckets
    const { partitionKeys: existingPartitionKeys, urlKeys: existingUrlKeys } =
      precomputeDealKeys(existingDeals);

    const existingWithKeys = existingDeals.map((d) => ({
      deal: d,
      url: existingUrlKeys.get(d) || precomputeUrlKey(d.url),
    }));
    const existingPartitions = partitionByKey(
      existingWithKeys,
      existingPartitionKeys,
    );

    const finalUnique: Deal[] = [];
    for (const deal of result.unique) {
      let isDuplicate = false;
      let matchedWith = "";
      const pkey = uniquePartitionKeys.get(deal) || buildPartitionKey(deal);
      const existingInBucket = existingPartitions.get(pkey) || [];

      if (existingInBucket.length > 0) {
        const dealUrlObj =
          uniqueUrlKeys.get(deal) || precomputeUrlKey(deal.url);
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
