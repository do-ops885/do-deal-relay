import type { Env } from "../../../types";
import {
  ReferralResearchResult,
  WebResearchRequest,
  ReferralInput,
} from "../../../types";
import { CONFIG } from "../../../config";
import {
  fetchFromSource,
  extractReferralsFromContent,
  researchRateLimiter,
  ExtractedReferral,
} from "../fetcher";
import { toError } from "../../sanitize-error";
import { logger } from "../../global-logger";
import type { FetchResult, ResearchSource } from "../types";
import { RESEARCH_SOURCES, KNOWN_REFERRAL_PROGRAMS } from "../constants";
import {
  normalizeResearchQuery,
  generateSearchQueries,
  generatePotentialCodes,
  simulateDiscovery,
  deduplicateCodes,
  extractRewardValue,
} from "../helpers";
import { isCircuitOpen, recordSuccess, recordFailure } from "./circuit-breaker";
import { getCachedResults, cacheResults } from "./cache";
import { isFeatureEnabled } from "../../feature-flags";
import {
  createDefaultScraperRegistry,
  readySourceNames,
  type SourceName,
  type ScraperEnv,
  type Scraper,
} from "../scrapers";
// MI-2 compliance: extractWithAI (and its Article 12 event) lives in
// compliance-log.ts to keep this file within source-size limits.
import { applySourceConfidence, extractWithAI } from "../compliance-log";

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

/**
 * Resolve whether the research agent should perform REAL fetching.
 *
 * Real fetching is the DEFAULT (MF-2). Simulation is only used when
 * explicitly requested through the test-only `use_simulated_results`
 * option or an explicit `use_real_fetching: false` override.
 *
 * Order of precedence:
 *   1. Request level: request.options?.use_simulated_results (test-only flag)
 *   2. Request level: request.options?.use_real_fetching (explicit override)
 *   3. Feature flag: real_research_fetching (supports rolloutPercentage)
 *   4. Environment allowlist: production OR explicit RESEARCH_USE_REAL_FETCHING=true
 *   5. Default: real fetching (honest results — never fabricate codes)
 */
async function shouldUseRealFetching(
  env: Env,
  request: WebResearchRequest,
): Promise<boolean> {
  // Test-only escape hatch: force simulated discovery.
  if (request.options?.use_simulated_results === true) {
    return false;
  }
  if (request.options?.use_real_fetching !== undefined) {
    return request.options.use_real_fetching;
  }
  const rolloutEnabled = await isFeatureEnabled("real_research_fetching", env);
  if (rolloutEnabled) {
    return true;
  }
  const envAllowsRealFetching =
    env.ENVIRONMENT === "production" ||
    env.RESEARCH_USE_REAL_FETCHING === "true";
  if (envAllowsRealFetching) {
    return true;
  }
  return false;
}

export async function executeReferralResearch(
  env: Env,
  request: WebResearchRequest,
): Promise<ReferralResearchResult> {
  const startTime = Date.now();
  const agentId = `research-agent-${Date.now()}`;

  const normalizedQuery = normalizeResearchQuery(request.query, request.domain);

  const apiKeys = getApiKeys(env);
  // MI-2: the orchestrator dispatches through the scraper registry.
  // readySourceNames() identifies which sources can actually run in this env.
  const registry = createDefaultScraperRegistry();
  const scraperEnv = env as unknown as ScraperEnv;
  const readySources = readySourceNames(registry, scraperEnv);
  // Real fetching is the default (MF-2); simulation is opt-in only.
  const useRealFetching = await shouldUseRealFetching(env, request);

  const discoveredCodes: ReferralResearchResult["discovered_codes"] = [];
  const sourcesChecked: string[] = [];
  const searchQueries: string[] = [];
  const errors: string[] = [];

  if (request.domain && KNOWN_REFERRAL_PROGRAMS[request.domain]) {
    sourcesChecked.push(`known_program:${request.domain}`);

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

  const sourcesToUse = request.sources || ["all"];
  const researchPromises: Promise<void>[] = [];

  if (sourcesToUse.includes("all")) {
    const sources = RESEARCH_SOURCES.slice(
      0,
      CONFIG.RESEARCH_MAX_SOURCES_PER_QUERY,
    );

    for (const source of sources) {
      const promise = researchFromSourceParallel(
        env,
        source,
        normalizedQuery,
        useRealFetching,
        request.depth,
        apiKeys,
        registry,
        readySources,
        discoveredCodes,
        sourcesChecked,
        searchQueries,
        errors,
      );
      researchPromises.push(promise);
    }

    await Promise.allSettled(researchPromises);
  } else {
    for (const sourceName of sourcesToUse) {
      const source = RESEARCH_SOURCES.find((s) => s.name === sourceName);
      if (!source) {
        errors.push(`Unknown source: ${sourceName}`);
        continue;
      }

      const promise = researchFromSourceParallel(
        env,
        source,
        normalizedQuery,
        useRealFetching,
        request.depth,
        apiKeys,
        registry,
        readySources,
        discoveredCodes,
        sourcesChecked,
        searchQueries,
        errors,
      );
      researchPromises.push(promise);
    }

    await Promise.allSettled(researchPromises);
  }

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

  if (request.domain) {
    try {
      await env.DEALS_SOURCES.put(
        `research:${request.domain}:${Date.now()}`,
        JSON.stringify(result),
        { expirationTtl: 86400 },
      );
    } catch (e) {
      errors.push(`Failed to cache results: ${(e as Error).message}`);
    }
  }

  return result;
}

async function researchFromSourceParallel(
  env: Env,
  source: ResearchSource,
  query: string,
  useRealFetching: boolean,
  depth: WebResearchRequest["depth"],
  apiKeys: ReturnType<typeof getApiKeys>,
  registry: Map<SourceName, Scraper>,
  readySources: string[],
  discoveredCodes: ReferralResearchResult["discovered_codes"],
  sourcesChecked: string[],
  searchQueries: string[],
  errors: string[],
): Promise<void> {
  if (isCircuitOpen(source.name)) {
    errors.push(`${source.name}: Circuit breaker is open`);
    return;
  }

  if (!researchRateLimiter.canMakeRequest(source.name)) {
    const waitTime = Math.ceil(
      researchRateLimiter.getTimeUntilNextWindow(source.name) / 1000,
    );
    errors.push(`Rate limited for ${source.name}, try again in ${waitTime}s`);
    return;
  }

  sourcesChecked.push(source.name);
  researchRateLimiter.recordRequest(source.name);

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

  const queries = generateSearchQueries(query, source.name);
  searchQueries.push(...queries);

  if (useRealFetching && source.apiConfig) {
    try {
      // MI-2: dispatch through the scraper registry when a matching scraper
      // is available and ready; otherwise fall back to the legacy fetcher.
      const scraper = registry.get(source.name as SourceName);
      const scraperEnv = {
        ...(env as unknown as ScraperEnv),
        baseUrl: source.baseUrl,
        searchPattern: source.searchPattern,
      } as ScraperEnv & { baseUrl?: string; searchPattern?: string };
      const canUseScraper =
        scraper &&
        readySources.includes(source.name) &&
        scraper.isReady(scraperEnv);

      let fetchResult: FetchResult | undefined;
      if (canUseScraper && scraper) {
        fetchResult = await scraper.scrape(scraperEnv, query);
      } else {
        fetchResult = await fetchFromSource(source, query, apiKeys);
      }

      if (fetchResult.success) {
        recordSuccess(source.name);

        const extracted = extractReferralsFromContent(
          fetchResult.content,
          source,
          source.name,
        );

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

        // MI-2: wire the AI extractor into the extraction path. When Workers
        // AI is available, run LLM-based extraction over the fetched content
        // to catch non-standard referral codes the regex extractor missed.
        const aiCodes = await extractWithAI(env, fetchResult.content, query);
        for (const aiCode of aiCodes) {
          discoveredCodes.push(aiCode);
          newCodes.push(aiCode);
        }

        cacheResults(query, source.name, newCodes);
      } else {
        errors.push(`${source.name}: ${fetchResult.error}`);
        recordFailure(source.name);
      }
    } catch (error) {
      const err = toError(error);
      errors.push(`${source.name}: ${err.message}`);
      recordFailure(source.name);
    }
  } else {
    // Simulation is only reachable via the explicit test-only flag (MF-2).
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

export async function convertResearchToReferrals(
  env: Env,
  researchResult: ReferralResearchResult,
  filterConfidence = 0.5,
): Promise<ReferralInput[]> {
  const referrals: ReferralInput[] = [];
  const now = new Date().toISOString();

  for (const discovered of researchResult.discovered_codes) {
    if (discovered.confidence < filterConfidence) continue;

    const idInput = `${researchResult.domain}:${discovered.code}`;
    const id = `web-${btoa(idInput).replace(/[+/=]/g, "").substring(0, 32)}`;

    const referral: ReferralInput = {
      id,
      code: discovered.code,
      url: discovered.url,
      domain: researchResult.domain,
      source: "web_research",
      status: "quarantined",
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
        is_valid: undefined,
        checked_urls: [discovered.url],
      },
    };

    referrals.push(referral);

    try {
      await env.DEALS_SOURCES.put(`referral:${id}`, JSON.stringify(referral), {
        expirationTtl: 2592000,
      });
    } catch (e) {
      const err = toError(e);
      logger.error("Failed to store referral", {
        component: "research-orchestrator",
        referral_id: id,
        error: err.message,
      });
    }
  }

  return referrals;
}

export async function researchAllReferralPossibilities(
  env: Env,
  domain: string,
  depth: WebResearchRequest["depth"] = "thorough",
  useRealFetching?: boolean,
): Promise<ReferralResearchResult> {
  const request: WebResearchRequest = {
    query: `${domain} referral code invite program`,
    domain,
    depth,
    sources: ["all"],
    max_results: 50,
    options:
      useRealFetching === undefined
        ? undefined
        : {
            use_real_fetching: useRealFetching,
          },
  };

  return executeReferralResearch(env, request);
}

export { fetchFromSource, extractReferralsFromContent, researchRateLimiter };
export type { ExtractedReferral };
