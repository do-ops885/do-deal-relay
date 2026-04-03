import type { Env } from "../../types";
import {
  ReferralResearchResult,
  WebResearchRequest,
  ReferralInput,
} from "../../types";
import { CONFIG } from "../../config";
import {
  fetchFromSource,
  extractReferralsFromContent,
  researchRateLimiter,
  ExtractedReferral,
} from "./fetcher";
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
function isCircuitOpen(sourceName: string): boolean {
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
function recordSuccess(sourceName: string): void {
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
function recordFailure(sourceName: string): void {
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
function getCachedResults(
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
function cacheResults(
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

function getApiKeys(env: Env) {
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
 * Execute web research for referral codes
 * Supports both real fetching and simulation modes with parallel research
 */
export async function executeReferralResearch(
  env: Env,
  request: WebResearchRequest,
): Promise<ReferralResearchResult> {
  const startTime = Date.now();
  const agentId = `research-agent-${Date.now()}`;

  // Normalize query
  const normalizedQuery = normalizeResearchQuery(request.query, request.domain);

  // Determine if we should use real fetching or simulation
  const useRealFetching = request.options?.use_real_fetching ?? false;

  // Gather research from multiple sources
  const discoveredCodes: ReferralResearchResult["discovered_codes"] = [];
  const sourcesChecked: string[] = [];
  const searchQueries: string[] = [];
  const errors: string[] = [];

  // If domain is known, use specialized patterns first
  if (request.domain && KNOWN_REFERRAL_PROGRAMS[request.domain]) {
    const knownProgram = KNOWN_REFERRAL_PROGRAMS[request.domain];
    sourcesChecked.push(`known_program:${request.domain}`);

    // Generate potential codes based on patterns
    const potentialCodes = generatePotentialCodes(
      request.domain,
      request.depth,
    );

    for (const code of potentialCodes) {
      discoveredCodes.push({
        code: code.code,
        url: code.url,
        source: `known_pattern:${request.domain}`,
        discovered_at: new Date().toISOString(),
        reward_summary: code.typicalReward,
        confidence: 0.7,
      });
    }
  }

  // Research from requested sources
  const sourcesToUse = request.sources || ["all"];
  const researchPromises: Promise<void>[] = [];

  if (sourcesToUse.includes("all")) {
    // Use top priority sources in parallel
    const apiKeys = getApiKeys(env);
    const sources = RESEARCH_SOURCES.slice(
      0,
      CONFIG.RESEARCH_MAX_SOURCES_PER_QUERY,
    );

    for (const source of sources) {
      const promise = researchFromSourceParallel(
        source,
        normalizedQuery,
        useRealFetching,
        request.depth,
        apiKeys,
        discoveredCodes,
        sourcesChecked,
        searchQueries,
        errors,
      );
      researchPromises.push(promise);
    }

    // Wait for all parallel research to complete
    await Promise.allSettled(researchPromises);
  } else {
    // Use specified sources
    const apiKeys = getApiKeys(env);

    for (const sourceName of sourcesToUse) {
      const source = RESEARCH_SOURCES.find((s) => s.name === sourceName);
      if (!source) {
        errors.push(`Unknown source: ${sourceName}`);
        continue;
      }

      const promise = researchFromSourceParallel(
        source,
        normalizedQuery,
        useRealFetching,
        request.depth,
        apiKeys,
        discoveredCodes,
        sourcesChecked,
        searchQueries,
        errors,
      );
      researchPromises.push(promise);
    }

    await Promise.allSettled(researchPromises);
  }

  // Deduplicate and limit results
  const uniqueCodes = deduplicateCodes(discoveredCodes).slice(
    0,
    request.max_results,
  );

  const result: ReferralResearchResult = {
    query: request.query,
    domain: request.domain || "unknown",
    discovered_codes: uniqueCodes,
    research_metadata: {
      sources_checked: sourcesChecked,
      search_queries: searchQueries,
      research_duration_ms: Date.now() - startTime,
      agent_id: agentId,
      errors: errors.length > 0 ? errors : undefined,
      used_real_fetching: useRealFetching,
    },
  };

  // Store research results if domain provided
  if (request.domain) {
    // Store in KV for caching
    try {
      await env.DEALS_SOURCES.put(
        `research:${request.domain}:${Date.now()}`,
        JSON.stringify(result),
        { expirationTtl: 86400 }, // 24 hours
      );
    } catch (e) {
      // Non-critical error
      errors.push(`Failed to cache results: ${(e as Error).message}`);
    }
  }

  return result;
}

/**
 * Research from a single source with circuit breaker and caching
 */
async function researchFromSourceParallel(
  source: ResearchSource,
  query: string,
  useRealFetching: boolean,
  depth: WebResearchRequest["depth"],
  apiKeys: ReturnType<typeof getApiKeys>,
  discoveredCodes: ReferralResearchResult["discovered_codes"],
  sourcesChecked: string[],
  searchQueries: string[],
  errors: string[],
): Promise<void> {
  // Check circuit breaker
  if (isCircuitOpen(source.name)) {
    errors.push(`${source.name}: Circuit breaker is open`);

    // Still provide simulated results if circuit is open
    const simulatedCodes = simulateDiscovery(query, source, depth);
    discoveredCodes.push(
      ...simulatedCodes.map((c) => ({
        ...c,
        source: `${c.source} (simulated - circuit open)`,
      })),
    );
    return;
  }

  // Check rate limit
  const rateLimit = getSourceRateLimit(source.name);
  if (!researchRateLimiter.canMakeRequest(source.name)) {
    const waitTime = Math.ceil(
      researchRateLimiter.getTimeUntilNextWindow(source.name) / 1000,
    );
    errors.push(`Rate limited for ${source.name}, try again in ${waitTime}s`);

    // Provide simulated results if rate limited
    const simulatedCodes = simulateDiscovery(query, source, depth);
    discoveredCodes.push(
      ...simulatedCodes.map((c) => ({
        ...c,
        source: `${c.source} (simulated - rate limited)`,
      })),
    );
    return;
  }

  sourcesChecked.push(source.name);
  researchRateLimiter.recordRequest(source.name);

  // Check cache first
  const cached = getCachedResults(query, source.name);
  if (cached) {
    discoveredCodes.push(
      ...cached.map((c) => ({
        ...c,
        source: `${c.source} (cached)`,
      })),
    );
    return;
  }

  // Generate search queries for this source
  const queries = generateSearchQueries(query, source.name);
  searchQueries.push(...queries);

  if (useRealFetching && source.apiConfig) {
    // Try real fetching
    try {
      const fetchResult = await fetchFromSource(source, query, apiKeys);

      if (fetchResult.success) {
        // Record success for circuit breaker
        recordSuccess(source.name);

        // Extract referrals from content
        const extracted = extractReferralsFromContent(
          fetchResult.content,
          source,
          source.name,
        );

        // Convert to discovered codes format
        const newCodes: ReferralResearchResult["discovered_codes"] = [];
        for (const referral of extracted) {
          if (referral.confidence >= CONFIG.RESEARCH_MIN_CONFIDENCE) {
            const codeEntry = {
              code: referral.code,
              url: referral.url,
              source: referral.source,
              discovered_at: referral.discoveredAt,
              reward_summary: referral.rewardSummary,
              confidence: applySourceConfidence(
                referral.confidence,
                source.name,
              ),
            };
            newCodes.push(codeEntry);
            discoveredCodes.push(codeEntry);
          }
        }

        // Cache the results
        cacheResults(query, source.name, newCodes);
      } else {
        errors.push(`${source.name}: ${fetchResult.error}`);
        recordFailure(source.name);

        // Fallback to simulation if fetch failed
        const simulatedCodes = simulateDiscovery(query, source, depth);
        discoveredCodes.push(
          ...simulatedCodes.map((c) => ({
            ...c,
            source: `${c.source} (simulated fallback)`,
            confidence: applySourceConfidence(c.confidence * 0.8, source.name), // Penalize fallback
          })),
        );
      }
    } catch (error) {
      errors.push(`${source.name}: ${(error as Error).message}`);
      recordFailure(source.name);

      // Fallback to simulation
      const simulatedCodes = simulateDiscovery(query, source, depth);
      discoveredCodes.push(
        ...simulatedCodes.map((c) => ({
          ...c,
          source: `${c.source} (simulated fallback)`,
          confidence: applySourceConfidence(c.confidence * 0.8, source.name),
        })),
      );
    }
  } else {
    // Use simulation mode
    const simulatedCodes = simulateDiscovery(query, source, depth);
    discoveredCodes.push(
      ...simulatedCodes.map((c) => ({
        ...c,
        source: `${c.source} (simulated)`,
        confidence: applySourceConfidence(c.confidence, source.name),
      })),
    );
  }
}

/**
 * Apply source-based confidence weighting
 */
function applySourceConfidence(
  baseConfidence: number,
  sourceName: string,
): number {
  const sourceWeights: { [key: string]: number } = {
    producthunt: 0.85,
    github: 0.8,
    reddit: 0.75,
    hackernews: 0.8,
    company_site: 0.7,
  };

  const weight = sourceWeights[sourceName] || 0.7;
  return Math.min(0.95, baseConfidence * weight);
}

/**
 * Convert discovered research codes to ReferralInput for storage
 */
export async function convertResearchToReferrals(
  env: Env,
  researchResult: ReferralResearchResult,
  filterConfidence = 0.5,
): Promise<ReferralInput[]> {
  const referrals: ReferralInput[] = [];
  const now = new Date().toISOString();

  for (const discovered of researchResult.discovered_codes) {
    if (discovered.confidence < filterConfidence) continue;

    // Generate ID from code and domain using btoa
    const idInput = `${researchResult.domain}:${discovered.code}`;
    const id = `web-${btoa(idInput).replace(/[+/=]/g, "").substring(0, 32)}`;

    const referral: ReferralInput = {
      id,
      code: discovered.code,
      url: discovered.url,
      domain: researchResult.domain,
      source: "web_research",
      status: "quarantined", // Start as quarantined for review
      submitted_at: now,
      submitted_by: discovered.source,
      metadata: {
        title: `${researchResult.domain} Referral`,
        description:
          discovered.reward_summary ||
          `Referral code discovered via web research`,
        reward_type: "unknown",
        reward_value: extractRewardValue(discovered.reward_summary),
        category: ["general"],
        tags: ["discovered", "web_research"],
        requirements: [],
        research_sources: [discovered.source],
        confidence_score: discovered.confidence,
        notes: `Discovered via ${discovered.source} at ${discovered.discovered_at}`,
      },
      validation: {
        last_validated: now,
        is_valid: undefined, // Not yet validated
        checked_urls: [discovered.url],
      },
    };

    referrals.push(referral);

    // Store in KV
    try {
      await env.DEALS_SOURCES.put(
        `referral:${id}`,
        JSON.stringify(referral),
        { expirationTtl: 2592000 }, // 30 days
      );
    } catch (e) {
      console.error(`Failed to store referral: ${(e as Error).message}`);
    }
  }

  return referrals;
}

/**
 * Research all possible referral codes for a domain
 */
export async function researchAllReferralPossibilities(
  env: Env,
  domain: string,
  depth: WebResearchRequest["depth"] = "thorough",
  useRealFetching = false,
): Promise<ReferralResearchResult> {
  const request: WebResearchRequest = {
    query: `${domain} referral code invite program`,
    domain,
    depth,
    sources: ["all"],
    max_results: 50,
    options: {
      use_real_fetching: useRealFetching,
    },
  };

  return executeReferralResearch(env, request);
}

// Re-export fetcher types and functions
export { fetchFromSource, extractReferralsFromContent, researchRateLimiter };
export type { ExtractedReferral };
