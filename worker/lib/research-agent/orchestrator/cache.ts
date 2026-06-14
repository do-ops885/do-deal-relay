import type { ReferralResearchResult } from "../../../types";
import type { ResearchCacheEntry } from "../types";

const researchCache = new Map<string, ResearchCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export function getCachedResults(
  query: string,
  source: string,
): ReferralResearchResult["discovered_codes"] | undefined {
  const key = `${source}:${query.toLowerCase()}`;
  const cached = researchCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  return undefined;
}

export function cacheResults(
  query: string,
  source: string,
  results: ReferralResearchResult["discovered_codes"],
): void {
  const key = `${source}:${query.toLowerCase()}`;
  researchCache.set(key, {
    query,
    source,
    results,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  if (researchCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of researchCache.entries()) {
      if (v.expiresAt < now) {
        researchCache.delete(k);
      }
    }
  }
}
