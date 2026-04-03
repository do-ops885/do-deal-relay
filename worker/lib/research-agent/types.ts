import { ReferralResearchResult, WebResearchRequest } from "../../types";

// ============================================================================
// Research Types and Interfaces
// ============================================================================

export interface ResearchSource {
  name: string;
  baseUrl: string;
  searchPattern: string;
  extractionPatterns: {
    code: RegExp[];
    reward: RegExp[];
    url: RegExp[];
  };
  priority: number;
  // API-specific configuration
  apiConfig?: SourceApiConfig;
}

// API Configuration for each source
export interface SourceApiConfig {
  type: "graphql" | "rest" | "oauth" | "algolia" | "direct";
  endpoint: string;
  authType: "bearer" | "token" | "oauth2" | "none";
  authHeaderName?: string;
  rateLimitPerMinute: number;
  timeoutMs: number;
  // Response transformer function name
  responseTransformer: string;
  // Additional headers
  headers?: { [key: string]: string };
}

// Rate limit tracking
export interface RateLimitStatus {
  remaining: number;
  resetAt: number;
  used: number;
  limit: number;
}

export interface ResearchCacheEntry {
  query: string;
  source: string;
  results: ReferralResearchResult["discovered_codes"];
  timestamp: number;
  expiresAt: number;
}

// ============================================================================
// API Response Types
// ============================================================================

// ProductHunt GraphQL API Response
export interface ProductHuntPost {
  id: string;
  name: string;
  tagline: string;
  url: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  thumbnail?: { url: string };
  topics?: { edges: Array<{ node: { name: string } }> };
  description?: string;
  website?: string;
}

export interface ProductHuntResponse {
  data?: {
    posts?: {
      edges: Array<{ node: ProductHuntPost }>;
    };
  };
  errors?: Array<{ message: string }>;
}

// GitHub Search API Response
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  created_at: string;
  updated_at: string;
  homepage: string | null;
}

export interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
}

// Hacker News Algolia API Response
export interface HackerNewsHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text: string | null;
  comment_text: string | null;
  _tags: string[];
}

export interface HackerNewsSearchResponse {
  hits: HackerNewsHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS: number;
  query: string;
  params: string;
}

// Reddit API Response
export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  is_self: boolean;
}

export interface RedditListingChild {
  kind: string;
  data: RedditPost;
}

export interface RedditListingResponse {
  kind: string;
  data: {
    after: string | null;
    before: string | null;
    children: RedditListingChild[];
    dist: number;
  };
}

// Meta tags type
export interface MetaTags {
  [key: string]: string;
}

// Generic Page Content
export interface PageContentResult {
  url: string;
  title: string;
  description: string;
  textContent: string;
  links: Array<{ text: string; href: string }>;
  metaTags: MetaTags;
}

// Research Configuration
export interface ResearchConfig {
  // API Keys (from environment)
  productHuntToken?: string;
  githubToken?: string;
  redditClientId?: string;
  redditClientSecret?: string;
  redditUsername?: string;
  redditPassword?: string;

  // Rate limiting
  maxRequestsPerMinute: number;
  requestWindowMs: number;

  // Retry configuration
  maxRetries: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;

  // Cache configuration
  cacheEnabled: boolean;
  cacheTtlMs: number;

  // Circuit breaker configuration
  circuitBreakerEnabled: boolean;
  failureThreshold: number;
  recoveryTimeoutMs: number;

  // Source weights for confidence scoring
  sourceWeights: { [key: string]: number };
}

// Circuit breaker state
export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: "closed" | "open" | "half-open";
  successCount: number;
}

// ============================================================================
// Known Referral Programs
// ============================================================================

export const KNOWN_REFERRAL_PROGRAMS: {
  [key: string]: {
    patterns: string[];
    urlFormats: string[];
    typicalRewards: string[];
  };
} = {
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
// Research Sources Configuration
// ============================================================================

export const RESEARCH_SOURCES: ResearchSource[] = [
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
      url: [/https?:\/\/[^\s"]+/gi],
    },
    priority: 1,
    apiConfig: {
      type: "graphql",
      endpoint: "https://api.producthunt.com/v2/api/graphql",
      authType: "bearer",
      rateLimitPerMinute: 30,
      timeoutMs: 10000,
      responseTransformer: "transformProductHuntResponse",
      headers: {
        "Content-Type": "application/json",
      },
    },
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
    apiConfig: {
      type: "direct",
      endpoint: "",
      authType: "none",
      rateLimitPerMinute: 60,
      timeoutMs: 15000,
      responseTransformer: "transformPageContent",
    },
  },
  {
    name: "reddit",
    baseUrl: "https://www.reddit.com",
    searchPattern: "/search/?q={query}%20referral",
    extractionPatterns: {
      code: [/code[:\s]+([A-Z0-9]{4,})/gi, /(?:use|my)\s+([A-Z0-9]{6,})/gi],
      reward: [/(\$?\d+[^<\.]{5,50}bonus)/gi, /(free[^<\.]{5,30})/gi],
      url: [/https?:\/\/[^\s"]+refer[^\s"]*/gi],
    },
    priority: 2,
    apiConfig: {
      type: "oauth",
      endpoint: "https://oauth.reddit.com",
      authType: "oauth2",
      rateLimitPerMinute: 60,
      timeoutMs: 10000,
      responseTransformer: "transformRedditResponse",
      headers: {
        "User-Agent": "DealDiscoveryBot/1.0 (by /u/dealdiscovery)",
      },
    },
  },
  {
    name: "hackernews",
    baseUrl: "https://hn.algolia.com",
    searchPattern: "/?q={query}%20referral",
    extractionPatterns: {
      code: [/invite[:\s]+([A-Z0-9]{4,})/gi, /ref[:\s]+([A-Z0-9]{4,})/gi],
      reward: [/(\d+%\s*off)/gi, /(\$\d+[^<\.]{5,30})/gi],
      url: [/https?:\/\/[^\s"]+/gi],
    },
    priority: 2,
    apiConfig: {
      type: "algolia",
      endpoint: "https://hn.algolia.com/api/v1/search",
      authType: "none",
      rateLimitPerMinute: 100,
      timeoutMs: 8000,
      responseTransformer: "transformHackerNewsResponse",
    },
  },
  {
    name: "github",
    baseUrl: "https://github.com",
    searchPattern: "/search?q={query}+referral",
    extractionPatterns: {
      code: [/code[:\s`]+([A-Z0-9]{4,})/gi, /`([A-Z0-9_-]{6,})`/g],
      reward: [/(\$[\d,]+(?:\.\d{2})?)/g, /(\d+\s*(credits|tokens))/gi],
      url: [/https?:\/\/[^\s"]+/gi],
    },
    priority: 3,
    apiConfig: {
      type: "rest",
      endpoint: "https://api.github.com/search/repositories",
      authType: "token",
      authHeaderName: "Authorization",
      rateLimitPerMinute: 30,
      timeoutMs: 10000,
      responseTransformer: "transformGitHubResponse",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function normalizeResearchQuery(query: string, domain?: string): string {
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

export function generateSearchQueries(
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

export function generatePotentialCodes(
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

export function generateSampleCode(domain: string, index: number): string {
  // Generate realistic-looking referral codes
  const prefixes = ["REF", "INV", domain.slice(0, 3).toUpperCase()];
  const prefix = prefixes[index % prefixes.length];
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${suffix}`;
}

// Legacy simulation function - kept for backwards compatibility
export function simulateDiscovery(
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

export function generateSimulatedCode(source: string, index: number): string {
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

export function generateSimulatedReward(source: string): string {
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

export function deduplicateCodes(
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

export function extractRewardValue(rewardSummary?: string): number | undefined {
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

// Get default research configuration
export function getDefaultResearchConfig(): ResearchConfig {
  return {
    maxRequestsPerMinute: 60,
    requestWindowMs: 60000,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxRetryDelayMs: 30000,
    cacheEnabled: true,
    cacheTtlMs: 3600000, // 1 hour
    circuitBreakerEnabled: true,
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
    sourceWeights: {
      producthunt: 0.85,
      github: 0.8,
      reddit: 0.75,
      hackernews: 0.8,
      company_site: 0.7,
    },
  };
}
