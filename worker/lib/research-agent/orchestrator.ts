import type { Env } from "../../types";
import {
  ReferralResearchResult,
  WebResearchRequest,
  ReferralInput,
} from "../../types";
import { storeResearchResults, storeReferralInput } from "../referral-storage";
import { generateDealId } from "../crypto";
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
} from "./types";

// ============================================================================
// Main Research Orchestration
// ============================================================================

/**
 * Execute web research for referral codes
 * This simulates a web research agent that searches for referral codes
 */
export async function executeReferralResearch(
  env: Env,
  request: WebResearchRequest,
): Promise<ReferralResearchResult> {
  const startTime = Date.now();
  const agentId = `research-agent-${Date.now()}`;

  // Normalize query
  const normalizedQuery = normalizeResearchQuery(request.query, request.domain);

  // Gather research from multiple sources (simulated for now)
  const discoveredCodes: ReferralResearchResult["discovered_codes"] = [];
  const sourcesChecked: string[] = [];
  const searchQueries: string[] = [];

  // If domain is known, use specialized patterns
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
  for (const sourceName of request.sources) {
    if (sourceName === "all") continue;

    const source = RESEARCH_SOURCES.find((s) => s.name === sourceName);
    if (!source) continue;

    sourcesChecked.push(source.name);

    // Simulate search queries
    const queries = generateSearchQueries(normalizedQuery, source.name);
    searchQueries.push(...queries);

    // Simulate discovering codes (in real implementation, this would fetch and parse)
    const simulatedCodes = simulateDiscovery(
      normalizedQuery,
      source,
      request.depth,
    );
    discoveredCodes.push(...simulatedCodes);
  }

  // If "all" sources requested, simulate comprehensive research
  if (request.sources.includes("all")) {
    for (const source of RESEARCH_SOURCES) {
      if (!sourcesChecked.includes(source.name)) {
        sourcesChecked.push(source.name);
        const simulatedCodes = simulateDiscovery(
          normalizedQuery,
          source,
          request.depth,
        );
        discoveredCodes.push(...simulatedCodes);
      }
    }
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
    },
  };

  // Store research results if domain provided
  if (request.domain) {
    await storeResearchResults(env, request.domain, result);
  }

  return result;
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

    const id = await generateDealId(
      "web_research",
      discovered.code,
      "research",
    );

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
        is_valid: undefined, // Not yet validated - using undefined instead of null
        checked_urls: [discovered.url],
      },
    };

    referrals.push(referral);
    await storeReferralInput(env, referral);
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
): Promise<ReferralResearchResult> {
  const request: WebResearchRequest = {
    query: `${domain} referral code invite program`,
    domain,
    depth,
    sources: ["all"],
    max_results: 50,
  };

  return executeReferralResearch(env, request);
}
