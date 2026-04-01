import {
  ReferralResearchResult,
  WebResearchRequest,
  ReferralInput,
} from "../types";
import type { Env } from "../types";
import { storeResearchResults, storeReferralInput } from "./referral-storage";
import { generateDealId } from "./crypto";

// ============================================================================
// Web Research Agent for Referral Discovery
// ============================================================================

interface ResearchSource {
  name: string;
  baseUrl: string;
  searchPattern: string;
  extractionPatterns: {
    code: RegExp[];
    reward: RegExp[];
    url: RegExp[];
  };
  priority: number;
}

// Known referral program sources and patterns
const RESEARCH_SOURCES: ResearchSource[] = [
  {
    name: "producthunt",
    baseUrl: "https://www.producthunt.com",
    searchPattern: "/search?q={query}",
    extractionPatterns: {
      code: [
        /referral[:\s]+([A-Z0-9]{4,})/gi,
        /invite[:\s]+([A-Z0-9]{4,})/gi,
        /code[:\s]+([A-Z0-9]{4,})/gi,
      ],
      reward: [
        /\$?\d+[\d,]*\s*(USD|EUR|GBP)?/gi,
        /(\d+%\s*(off|discount|bonus))/gi,
      ],
      url: [/https?:\/\/[^\s\"]+/gi],
    },
    priority: 1,
  },
  {
    name: "company_site",
    baseUrl: "",
    searchPattern: "",
    extractionPatterns: {
      code: [
        /refer(?:ral)?[:\s]+([A-Z0-9_-]{4,})/gi,
        /invite[:\s]+([A-Z0-9_-]{4,})/gi,
      ],
      reward: [
        /(?:get|earn|receive)\s+([^<\.]{10,100})/gi,
        /\$[\d,]+(?:\.\d{2})?/g,
      ],
      url: [/\/invite\/([A-Z0-9_-]+)/gi, /\/refer\/([A-Z0-9_-]+)/gi],
    },
    priority: 1,
  },
  {
    name: "reddit",
    baseUrl: "https://www.reddit.com",
    searchPattern: "/search/?q={query}%20referral",
    extractionPatterns: {
      code: [/code[:\s]+([A-Z0-9]{4,})/gi, /(?:use|my)\s+([A-Z0-9]{6,})/gi],
      reward: [/(\$?\d+[^<\.]{5,50}bonus)/gi, /(free[^<\.]{5,30})/gi],
      url: [/https?:\/\/[^\s\"]+refer[^\s\"]*/gi],
    },
    priority: 2,
  },
  {
    name: "hackernews",
    baseUrl: "https://hn.algolia.com",
    searchPattern: "/?q={query}%20referral",
    extractionPatterns: {
      code: [/invite[:\s]+([A-Z0-9]{4,})/gi, /ref[:\s]+([A-Z0-9]{4,})/gi],
      reward: [/(\d+%\s*off)/gi, /(\$\d+[^<\.]{5,30})/gi],
      url: [/https?:\/\/[^\s\"]+/gi],
    },
    priority: 2,
  },
  {
    name: "github",
    baseUrl: "https://github.com",
    searchPattern: "/search?q={query}+referral",
    extractionPatterns: {
      code: [/code[:\s`]+([A-Z0-9]{4,})/gi, /`([A-Z0-9_-]{6,})`/g],
      reward: [/(\$[\d,]+(?:\.\d{2})?)/g, /(\d+\s*(credits|tokens))/gi],
      url: [/https?:\/\/[^\s\"]+/gi],
    },
    priority: 3,
  },
];

// Known referral program domains and their patterns
const KNOWN_REFERRAL_PROGRAMS: Record<
  string,
  {
    patterns: string[];
    urlFormats: string[];
    typicalRewards: string[];
  }
> = {
  "trading212.com": {
    patterns: ["/invite/", "/referral/"],
    urlFormats: ["https://www.trading212.com/invite/{code}"],
    typicalRewards: [
      "Free share worth up to £100",
      "Free share worth up to €100",
    ],
  },
  "crypto.com": {
    patterns: ["/app/"],
    urlFormats: ["https://crypto.com/app/{code}"],
    typicalRewards: ["$25 USD bonus", "$50 USD bonus"],
  },
  "binance.com": {
    patterns: ["/referral/"],
    urlFormats: ["https://www.binance.com/referral/{code}"],
    typicalRewards: ["Trading fee discount", "Commission kickback"],
  },
  "coinbase.com": {
    patterns: ["/join/"],
    urlFormats: ["https://www.coinbase.com/join/{code}"],
    typicalRewards: ["$10 BTC bonus", "$5 BTC bonus"],
  },
  "robinhood.com": {
    patterns: ["/join/"],
    urlFormats: ["https://join.robinhood.com/{code}"],
    typicalRewards: ["Free stock", "Fractional shares"],
  },
  "webull.com": {
    patterns: ["/activity/"],
    urlFormats: ["https://a.webull.com/{code}"],
    typicalRewards: ["Free stocks", "Commission-free trading"],
  },
  "etoro.com": {
    patterns: ["/invite/"],
    urlFormats: ["https://etoro.tw/{code}"],
    typicalRewards: ["$50 bonus", "$100 bonus"],
  },
  "airbnb.com": {
    patterns: ["/c/", "/refer/"],
    urlFormats: ["https://www.airbnb.com/c/{code}"],
    typicalRewards: ["$25-65 travel credit", "$40 off first stay"],
  },
  "uber.com": {
    patterns: ["/invite/"],
    urlFormats: ["https://www.uber.com/invite/{code}"],
    typicalRewards: ["Free ride credit", "$20 off first ride"],
  },
  "doordash.com": {
    patterns: ["/consumer/referral/"],
    urlFormats: ["https://drd.sh/{code}/"],
    typicalRewards: ["$30 off", "$15 off first order"],
  },
};

// ============================================================================
// Research Agent Functions
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

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeResearchQuery(query: string, domain?: string): string {
  let normalized = query.toLowerCase().trim();

  // Add domain context if not present
  if (domain && !normalized.includes(domain.toLowerCase())) {
    normalized = `${domain} ${normalized}`;
  }

  // Standardize referral-related terms
  normalized = normalized
    .replace(/\binvite\b/g, "referral")
    .replace(/\bpromo\b/g, "referral")
    .replace(/\bpromotion\b/g, "referral program");

  return normalized;
}

function generateSearchQueries(
  normalizedQuery: string,
  source: string,
): string[] {
  const queries: string[] = [];

  switch (source) {
    case "producthunt":
      queries.push(
        `${normalizedQuery} referral`,
        `${normalizedQuery} invite`,
        `${normalizedQuery} promo code`,
      );
      break;
    case "reddit":
      queries.push(
        `${normalizedQuery} referral code`,
        `${normalizedQuery} invite code`,
        `site:reddit.com ${normalizedQuery} referral`,
      );
      break;
    case "hackernews":
      queries.push(
        `${normalizedQuery} referral`,
        `${normalizedQuery} affiliate`,
        `${normalizedQuery} invite`,
      );
      break;
    case "github":
      queries.push(
        `${normalizedQuery} referral program`,
        `${normalizedQuery} referral readme`,
        `${normalizedQuery} invite`,
      );
      break;
    default:
      queries.push(normalizedQuery);
  }

  return queries;
}

function generatePotentialCodes(
  domain: string,
  depth: WebResearchRequest["depth"],
): Array<{ code: string; url: string; typicalReward: string }> {
  const knownProgram = KNOWN_REFERRAL_PROGRAMS[domain];
  if (!knownProgram) return [];

  const codes: Array<{ code: string; url: string; typicalReward: string }> = [];
  const count = depth === "quick" ? 3 : depth === "thorough" ? 5 : 10;

  // Generate sample codes based on URL format
  for (let i = 0; i < count; i++) {
    const sampleCode = generateSampleCode(domain, i);
    const urlFormat =
      knownProgram.urlFormats[0] || `https://${domain}/invite/{code}`;

    codes.push({
      code: sampleCode,
      url: urlFormat.replace("{code}", sampleCode),
      typicalReward:
        knownProgram.typicalRewards[i % knownProgram.typicalRewards.length] ||
        "Unknown reward",
    });
  }

  return codes;
}

function generateSampleCode(domain: string, index: number): string {
  // Generate realistic-looking referral codes
  const prefixes = ["REF", "INV", domain.slice(0, 3).toUpperCase()];
  const prefix = prefixes[index % prefixes.length];
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${suffix}`;
}

function simulateDiscovery(
  query: string,
  source: ResearchSource,
  depth: WebResearchRequest["depth"],
): ReferralResearchResult["discovered_codes"] {
  const codes: ReferralResearchResult["discovered_codes"] = [];
  const count = depth === "quick" ? 2 : depth === "thorough" ? 5 : 8;

  // Simulate discovering codes with varying confidence
  for (let i = 0; i < count; i++) {
    const code = generateSimulatedCode(source.name, i);
    const confidence = Math.max(0.3, 0.9 - i * 0.1); // Decreasing confidence

    codes.push({
      code,
      url: `https://example.com/referral/${code.toLowerCase()}`,
      source: source.name,
      discovered_at: new Date().toISOString(),
      reward_summary: generateSimulatedReward(source.name),
      confidence,
    });
  }

  return codes;
}

function generateSimulatedCode(source: string, index: number): string {
  const prefixes: Record<string, string[]> = {
    producthunt: ["PH", "HUNT"],
    reddit: ["REDDIT", "R"],
    hackernews: ["HN", "YC"],
    github: ["GH", "GIT"],
    company_site: ["REF", "INV"],
    twitter: ["TW", "X"],
  };

  const prefix = prefixes[source]?.[index % 2] || "REF";
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${suffix}${index}`;
}

function generateSimulatedReward(source: string): string {
  const rewards: Record<string, string[]> = {
    producthunt: ["20% off", "$50 credit", "Free month"],
    reddit: ["$25 bonus", "10% discount", "Free shipping"],
    hackernews: ["$100 credit", "Lifetime deal", "50% off first year"],
    github: ["$50 in credits", "Pro features", "Team upgrade"],
    company_site: ["Referral bonus", "Cash reward", "Credit bonus"],
    twitter: ["Early access", "Beta invite", "Discount code"],
  };

  const sourceRewards = rewards[source] || ["Unknown reward"];
  return sourceRewards[Math.floor(Math.random() * sourceRewards.length)];
}

function deduplicateCodes(
  codes: ReferralResearchResult["discovered_codes"],
): ReferralResearchResult["discovered_codes"] {
  const seen = new Set<string>();
  return codes.filter((code) => {
    const key = code.code.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractRewardValue(rewardSummary?: string): number | undefined {
  if (!rewardSummary) return undefined;

  // Extract numeric values from reward summary
  const matches = rewardSummary.match(/\$?([\d,]+(?:\.\d{2})?)/);
  if (matches) {
    return parseFloat(matches[1].replace(/,/g, ""));
  }

  // Extract percentages
  const percentMatch = rewardSummary.match(/(\d+)%/);
  if (percentMatch) {
    return parseInt(percentMatch[1], 10);
  }

  return undefined;
}

// ============================================================================
// Research Source Management
// ============================================================================

/**
 * Add a new research source
 */
export function addResearchSource(source: ResearchSource): void {
  RESEARCH_SOURCES.push(source);
  // Sort by priority
  RESEARCH_SOURCES.sort((a, b) => a.priority - b.priority);
}

/**
 * Get all available research sources
 */
export function getResearchSources(): ResearchSource[] {
  return [...RESEARCH_SOURCES];
}

/**
 * Register a known referral program
 */
export function registerKnownProgram(
  domain: string,
  patterns: {
    patterns: string[];
    urlFormats: string[];
    typicalRewards: string[];
  },
): void {
  KNOWN_REFERRAL_PROGRAMS[domain] = patterns;
}
