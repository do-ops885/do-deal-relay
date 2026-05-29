// Research Agent Module - Re-exports
// ============================================================================

// Main orchestration functions
export {
  executeReferralResearch,
  convertResearchToReferrals,
  researchAllReferralPossibilities,
  fetchFromSource,
  extractReferralsFromContent,
  researchRateLimiter,
} from "./orchestrator";

// Source management
export {
  addResearchSource,
  getResearchSources,
  registerKnownProgram,
  getSourceByName,
  getSourceApiConfig,
  updateSourceApiConfig,
  getApiEnabledSources,
  getSourceRateLimit,
  getSourceAuthEnvVars,
  SOURCE_RATE_LIMITS,
  SOURCE_AUTH_ENV_VARS,
} from "./sources";

// Fetcher functions
export {
  type FetchResult,
  type ExtractedReferral,
  fetchProductHuntDeals,
  fetchGitHubTrending,
  fetchHackerNewsDeals,
  fetchRedditDeals,
  fetchGenericPageContent,
} from "./fetcher";

// Extractor
export {
  extractContent,
  extractWithSelectorSet,
  type ExtractionConfig,
  type ExtractedContent,
} from "./extractor";

// Summarizer
export {
  summarizeContent,
  summarizeFromExtracted,
  type ResearchSummary,
} from "./summarizer";

// Request Manager
export { RequestManager } from "./request-manager";

// Types
export type {
  ResearchSource,
  SourceApiConfig,
  RateLimitStatus,
  ResearchCacheEntry,
  ProductHuntResponse,
  ProductHuntPost,
  GitHubSearchResponse,
  GitHubRepository,
  HackerNewsSearchResponse,
  HackerNewsHit,
  RedditListingResponse,
  RedditPost,
  PageContentResult,
  MetaTags,
  ResearchConfig,
  CircuitBreakerState,
} from "./types";

// Utility functions from types
export {
  RESEARCH_SOURCES,
  KNOWN_REFERRAL_PROGRAMS,
  normalizeResearchQuery,
  generateSearchQueries,
  generatePotentialCodes,
  generateSampleCode,
  simulateDiscovery,
  generateSimulatedCode,
  generateSimulatedReward,
  deduplicateCodes,
  extractRewardValue,
  getDefaultResearchConfig,
} from "./types";
