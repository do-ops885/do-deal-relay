// Rate Limit Constants
const DEFAULT_HN_RATE_LIMIT = 100;
const DEFAULT_REDDIT_RATE_LIMIT = 60;
const DEFAULT_PH_RATE_LIMIT = 30;
const DEFAULT_GITHUB_RATE_LIMIT = 30;
// ============================================================================
// Configuration Constants
// ============================================================================

import { VERSION } from "./version";

/**
 * Global configuration constants for the Deal Discovery System.
 * Includes timing, limits, scoring weights, and validation thresholds.
 */
export const CONFIG = {
  // System
  VERSION,
  SCHEMA_VERSION: "1.0.0",

  // Timing
  LOCK_TTL_SECONDS: 300, // 5 minutes
  CRON_SCHEDULE: "0 */6 * * *", // Every 6 hours
  NOTIFICATION_COOLDOWN_HOURS: 6,

  // Limits
  MAX_PAYLOAD_SIZE_BYTES: 1_000_000, // 1MB
  FETCH_TIMEOUT_MS: 30_000, // 30 seconds
  RESEARCH_FETCH_TIMEOUT_MS: 15_000, // 15 seconds for research
  MAX_RETRIES: 3,
  MAX_DEALS_PER_RUN: 1000,

  // User Agent for web requests
  USER_AGENT: "DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)",

  // Research settings
  DISCOVERY_BATCH_WINDOW: 500,
  RESEARCH_MAX_SOURCES_PER_QUERY: 5,
  RESEARCH_MIN_CONFIDENCE: 0.3,
  RESEARCH_CACHE_TTL_MINUTES: 60,
  RESEARCH_USE_REAL_FETCHING_DEFAULT: true,
  RESEARCH_CACHE_TTL_SECONDS: 3600,
  RESEARCH_RATE_LIMIT_WINDOW_MS: 60000,
  RESEARCH_MAX_RETRIES: 3,
  RESEARCH_RETRY_BASE_DELAY_MS: 1000,
  RESEARCH_RETRY_MAX_DELAY_MS: 30000,

  // API Rate Limits
  API_RATE_LIMITS: {
    PRODUCTHUNT: DEFAULT_PH_RATE_LIMIT, // requests per minute
    GITHUB: DEFAULT_GITHUB_RATE_LIMIT,
    HACKERNEWS: DEFAULT_HN_RATE_LIMIT,
    REDDIT: DEFAULT_REDDIT_RATE_LIMIT,
  },

  // Retry settings
  RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,

  // KV batching settings
  KV_BATCH_SIZE: 25, // Cloudflare Workers subrequest limit is 50, we use 25 for safety margin

  // CI polling settings
  CI_POLL_MAX_ATTEMPTS: 18,
  CI_POLL_INTERVAL_MS: 10000,

  // Scoring weights
  SCORING_WEIGHTS: {
    validity_ratio: 0.25,
    uniqueness_score: 0.2,
    source_diversity: 0.15,
    historical_trust: 0.15,
    duplicate_penalty: 0.1,
    reward_plausibility: 0.1,
    expiry_confidence: 0.05,
  },

  // Validation thresholds
  MIN_TRUST_SCORE: 0.3,
  MIN_CONFIDENCE_SCORE: 0.5,
  SIMILARITY_THRESHOLD: 0.8,
  MAX_REWARD_VALUE: 10000, // $10K cap for sanity
  MAX_CODE_LENGTH: 50,
  PLAUSIBILITY_THRESHOLDS: {
    CASH_LOW: 50,
    CASH_MEDIUM: 100,
    CASH_HIGH: 500,
    PERCENT_MIN_OPTIMAL: 10,
    PERCENT_MAX_OPTIMAL: 50,
    OPTIMAL_SOURCE_COUNT: 5,
    DIVERSITY_MULTIPLIER: 2,
    PERCENT_MIN_THRESHOLD: 5,
    REWARD_PLAUSIBILITY_DEFAULT: 0.8,
    CREDIT_PLAUSIBILITY: 0.9,
    ITEM_PLAUSIBILITY: 0.8,
    SUSPICIOUS_REWARD_PLAUSIBILITY: 0.5,
    DUPLICATE_PENALTY_VALUE: 0.5,
    PLAUSIBILITY_MEDIUM: 0.9,
    PLAUSIBILITY_HIGH: 0.7,
    PLAUSIBILITY_LOW: 0.7,
  },

  // Trust model
  TRUST_BOUNDS: {
    trusted: { min: 0.8, max: 1.0 },
    probationary: { min: 0.5, max: 0.8 },
    unverified: { min: 0.2, max: 0.5 },
    blocked: { min: 0.0, max: 0.2 },
  },
  TRUST_ADJUSTMENT: {
    success: 0.1,
    failure: -0.2,
  },

  // Notifications
  HIGH_VALUE_THRESHOLD: 100, // $100
  NOTIFICATION_SEVERITY: ["info", "warning", "critical"] as const,

  // File paths
  SNAPSHOT_FILE: "deals.json",
  CANDIDATE_FILE: "deals-candidate.json",
  RESEARCH_MD_FILE: "deals-research.md",
  STATUS_FILE: "status.json",

  // NLQ (Natural Language Query) settings
  NLQ_MAX_QUERY_LENGTH: 500,
  NLQ_RULE_MAX_QUERY_LENGTH: 100,
  NLQ_DEFAULT_LIMIT: 20,
  NLQ_MAX_LIMIT: 100,
  NLQ_RATE_LIMIT_PER_MINUTE: 30,
  NLQ_AI_MAX_TOKENS_LONG: 500,
  NLQ_AI_MAX_TOKENS_SHORT: 100,
  NLQ_AI_CONFIDENCE_THRESHOLD: 0.75,
  NLQ_AI_CACHE_TTL_MINUTES: 60,

  // Experience Feedback System
  EXPERIENCE_MAX_SCORE: 100,
  EXPERIENCE_MIN_SCORE: -100,
  EXPERIENCE_BATCH_SIZE: 100,
  EXPERIENCE_AGGREGATE_WINDOW_HOURS: 24,

  // KV keys
  KV_KEYS: {
    PROD_SNAPSHOT: "snapshot:prod",
    STAGING_SNAPSHOT: "snapshot:staging",
    LAST_RUN: "meta:last_run",
    METRICS: "meta:metrics",
  },
  // Security
  BLOCKED_HOSTS: [
    "localhost",
    "127.0.0.1",
    "metadata.google.internal",
    "169.254.169.254",
  ],
  BLOCKED_IP_RANGES: [
    "127.0.0.0/8",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "169.254.0.0/16",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
  ],
} as const;

// ============================================================================
// Default Source Registry
// ============================================================================

export const DEFAULT_SOURCES = [
  {
    domain: "trading212.com",
    url_patterns: ["/invite/", "/referral/"],
    selectors: {
      code: "[data-ref-code], .referral-code, .invite-code",
      reward: ".reward-amount, [data-reward], .bonus-value",
    },
    trust_initial: 0.7,
    classification: "probationary" as const,
    active: true,
  },
  {
    domain: "revolut.com",
    url_patterns: ["/referral/", "/invite/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.6,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "wise.com",
    url_patterns: ["/invite/", "/referral/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.6,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "robinhood.com",
    url_patterns: ["/signup/", "/referral/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.6,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "webull.com",
    url_patterns: ["/invite/", "/referral/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.5,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "public.com",
    url_patterns: ["/referral/", "/invite/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.5,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "crypto.com",
    url_patterns: ["/referral/", "/invite/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.5,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "binance.com",
    url_patterns: ["/en/activity/referral/", "/en/register"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.5,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "coinbase.com",
    url_patterns: ["/invite/", "/referral/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.6,
    classification: "unverified" as const,
    active: true,
  },
  {
    domain: "paypal.com",
    url_patterns: ["/referral/", "/invite/"],
    selectors: {
      code: "[data-ref-code], .referral-code",
      reward: ".bonus-amount, .reward-value",
    },
    trust_initial: 0.5,
    classification: "unverified" as const,
    active: true,
  },
];

// ============================================================================
// Research Selector Configs for Known Domains
// ============================================================================

export interface ExtractSelectorSet {
  dealTitle: string[];
  price: string[];
  source: string[];
  description: string[];
  keyPoints: string[];
  code: string[];
  reward: string[];
}

export const RESEARCH_SELECTOR_CONFIGS: Record<string, ExtractSelectorSet> = {
  "trading212.com": {
    dealTitle: [
      ".campaign-title",
      "h1.invite-title",
      "[data-testid='campaign-name']",
    ],
    price: [".reward-amount", ".bonus-value", "[data-reward]"],
    source: [".source-name", ".broker-name"],
    description: [".campaign-description", ".terms-text"],
    keyPoints: [".feature-list li", ".benefits-list li"],
    code: ["[data-ref-code]", ".referral-code", ".invite-code"],
    reward: [".reward-amount", "[data-reward]", ".bonus-value"],
  },
  "revolut.com": {
    dealTitle: [".referral-title", "h1"],
    price: [".bonus-amount", ".reward-value"],
    source: [".source-name"],
    description: [".referral-description", ".terms"],
    keyPoints: [".benefits li", ".features li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
  "wise.com": {
    dealTitle: [".invite-title", "h1"],
    price: [".bonus-amount", ".reward-value"],
    source: [".source-name"],
    description: [".invite-description", ".terms"],
    keyPoints: [".benefits li", ".how-it-works li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
  "robinhood.com": {
    dealTitle: [".referral-title", "h1"],
    price: [".bonus-amount", ".reward-value", ".stock-value"],
    source: [".source-name"],
    description: [".referral-description", ".terms"],
    keyPoints: [".features li", ".benefits li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
  "webull.com": {
    dealTitle: [".invite-title", "h1"],
    price: [".bonus-amount", ".reward-value"],
    source: [".source-name"],
    description: [".invite-description", ".terms"],
    keyPoints: [".features li", ".steps li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
  "crypto.com": {
    dealTitle: [".referral-title", "h1"],
    price: [".bonus-amount", ".reward-value"],
    source: [".source-name"],
    description: [".referral-description", ".terms"],
    keyPoints: [".features li", ".benefits li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
  "binance.com": {
    dealTitle: [".referral-title", ".activity-title", "h1"],
    price: [".bonus-amount", ".reward-value", "[data-bonus]"],
    source: [".source-name"],
    description: [".referral-description", ".activity-desc"],
    keyPoints: [".features li", ".rules li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
  "coinbase.com": {
    dealTitle: [".invite-title", "h1"],
    price: [".bonus-amount", ".reward-value"],
    source: [".source-name"],
    description: [".invite-description", ".terms"],
    keyPoints: [".benefits li", ".features li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
  "paypal.com": {
    dealTitle: [".referral-title", "h1"],
    price: [".bonus-amount", ".reward-value"],
    source: [".source-name"],
    description: [".referral-description", ".terms"],
    keyPoints: [".benefits li", ".features li"],
    code: ["[data-ref-code]", ".referral-code"],
    reward: [".bonus-amount", ".reward-value"],
  },
};

// ============================================================================
// Error Messages
// ============================================================================

export const ERROR_MESSAGES = {
  LOCK_CONFLICT: "Another run is in progress (lock conflict)",
  HASH_MISMATCH: "Snapshot hash mismatch - possible concurrent modification",
  VALIDATION_FAILED: "One or more validation gates failed",
  PUBLISH_FAILED: "Failed to publish to production",
  FETCH_FAILED: "Failed to fetch from source",
  PARSE_FAILED: "Failed to parse content",
  NOTIFICATION_FAILED: "Failed to send notification",
} as const;

// ============================================================================
// Validation Gate Names
// ============================================================================

export const VALIDATION_GATES = [
  "schema_validation",
  "normalization_verification",
  "deduplication_check",
  "source_trust",
  "reward_plausibility",
  "expiry_validation",
  "second_pass_validation",
  "idempotency_check",
  "snapshot_hash_verification",
] as const;

export type ValidationGate = (typeof VALIDATION_GATES)[number];
