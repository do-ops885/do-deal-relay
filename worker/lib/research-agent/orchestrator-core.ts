import type { Env } from "../../types";
import {
  ReferralResearchResult,
  WebResearchRequest,
  ReferralInput,
} from "../../types";
import { CONFIG } from "../../config";
import { fetchFromSource } from "./fetcher";
import {
  extractReferralsFromContent,
  type ExtractedReferral,
} from "./extractor";
import { researchRateLimiter } from "./rate-limiter";
import {
  ResearchSource,
  RESEARCH_SOURCES,
  KNOWN_REFERRAL_PROGRAMS,
  normalizeResearchQuery,
  generateSearchQueries,
  generatePotentialCodes,
  simulateDiscovery,
  deduplicateCodes,
  extractRewardValue,
  type CircuitBreakerState,
  type ResearchCacheEntry,
} from "./types";
import { getSourceRateLimit } from "./sources";

// ============================================================================
// Circuit Breaker Management
// ============================================================================

const circuitBreakerStates = new Map<string, CircuitBreakerState>();

/**
 * Check if a source circuit breaker is open (failing)
 */
export function isCircuitOpen(sourceName: string): boolean {
  const state = circuitBreakerStates.get(sourceName);
  if (!state) return false;

  if (state.state === "open") {
    // Check if recovery timeout has passed
    if (Date.now() - state.lastFailureTime > 30000) {
      // 30 second recovery
      state.state = "half-open";
      state.successCount = 0;
      return false; // Allow one request through
    }
    return true;
  }

  return false;
}

/**
 * Record success for circuit breaker
 */
export function recordSuccess(sourceName: string): void {
  const state = circuitBreakerStates.get(sourceName);
  if (state && state.state === "half-open") {
    state.successCount++;
    if (state.successCount >= 3) {
      // Reset after 3 successes
      state.state = "closed";
      state.failures = 0;
    }
  }
}

/**
 * Record failure for circuit breaker
 */
export function recordFailure(sourceName: string): void {
  let state = circuitBreakerStates.get(sourceName);
  if (!state) {
    state = {
      failures: 0,
      lastFailureTime: 0,
      state: "closed",
      successCount: 0,
    };
    circuitBreakerStates.set(sourceName, state);
  }

  state.failures++;
  state.lastFailureTime = Date.now();

  if (state.failures >= 5) {
    // Open circuit after 5 failures
    state.state = "open";
  }
}

// ============================================================================
// Research Cache
// ============================================================================

const researchCache = new Map<string, ResearchCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get cached research results
 */
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

/**
 * Cache research results
 */
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

  // Clean up old cache entries periodically
  if (researchCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of researchCache.entries()) {
      if (v.expiresAt < now) {
        researchCache.delete(k);
      }
    }
  }
}

// ============================================================================
// API Keys from Environment
// ============================================================================

export function getApiKeys(env: Env) {
  return {
    productHuntToken: (env as { PRODUCTHUNT_API_TOKEN?: string })
      .PRODUCTHUNT_API_TOKEN,
    githubToken: (env as { GITHUB_API_TOKEN?: string }).GITHUB_API_TOKEN,
    redditClientId: (env as { REDDIT_CLIENT_ID?: string }).REDDIT_CLIENT_ID,
    redditClientSecret: (env as { REDDIT_CLIENT_SECRET?: string })
      .REDDIT_CLIENT_SECRET,
  };
}

// ============================================================================
// Main Research Orchestration
// ============================================================================

/**
 * Execute web research for referral codes.
 *
 * This function orchestrates research across multiple sources (Product Hunt, Reddit, GitHub, etc.)
 * using both simulation and real fetching if API keys are provided. It handles normalization,
 * deduplication, and caching of results.
 *
 * @param env - The Cloudflare Worker environment bindings.
 * @param request - The research request configuration.
 * @returns A promise that resolves to the aggregated research results.
 * @throws {PipelineError} If research execution fails critically.
 */
