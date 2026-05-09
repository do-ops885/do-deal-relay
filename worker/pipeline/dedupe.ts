import { Deal, PipelineContext } from "../types";
import { CONFIG } from "../config";
import {
  calculateUrlSimilarity,
  calculateStringSimilarity,
} from "../lib/crypto";
import { calculateSourceDiversity, calculateUniquenessScore } from "./score";

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
  const semanticUrlsByDomain = new Map<
    string,
    Array<{ deal: Deal; url: URL | string }>
  >();

  for (const deal of result.unique) {
    let isDuplicate = false;
    let matchedWith = "";

    const domain = deal.source.domain;
    const existingInDomain = semanticUrlsByDomain.get(domain) || [];
    let urlToCompare: URL | string;
    try {
      urlToCompare = new URL(deal.url);
    } catch {
      urlToCompare = deal.url;
    }

    for (const existing of existingInDomain) {
      const similarity = calculateUrlSimilarity(urlToCompare, existing.url);
      if (similarity >= CONFIG.SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        matchedWith = existing.deal.id;
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
      if (!semanticUrlsByDomain.has(domain)) {
        semanticUrlsByDomain.set(domain, []);
      }
      semanticUrlsByDomain.get(domain)!.push({ deal, url: urlToCompare });
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

    // Group existing deals by domain for faster lookup, pre-parsing URLs
    const existingByDomain = new Map<
      string,
      Array<{ deal: Deal; url: URL | string }>
    >();
    for (const d of existingDeals) {
      const domain = d.source.domain;
      if (!existingByDomain.has(domain)) {
        existingByDomain.set(domain, []);
      }
      let urlObj: URL | string;
      try {
        urlObj = new URL(d.url);
      } catch {
        urlObj = d.url;
      }
      existingByDomain.get(domain)!.push({ deal: d, url: urlObj });
    }

    for (const deal of result.unique) {
      let isDuplicate = false;
      let matchedWith = "";

      const existingInDomain = existingByDomain.get(deal.source.domain) || [];
      let dealUrlObj: URL | string;
      try {
        dealUrlObj = new URL(deal.url);
      } catch {
        dealUrlObj = deal.url;
      }

      for (const existing of existingInDomain) {
        // Exact ID match
        if (existing.deal.id === deal.id) {
          isDuplicate = true;
          matchedWith = existing.deal.id;
          break;
        }

        // Same code from same domain
        // (already grouped by domain, so just check code)
        if (existing.deal.code === deal.code) {
          isDuplicate = true;
          matchedWith = existing.deal.id;
          break;
        }

        // Semantic URL match
        const urlSim = calculateUrlSimilarity(existing.url, dealUrlObj);
        if (urlSim >= CONFIG.SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          matchedWith = existing.deal.id;
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
