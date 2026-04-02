// ============================================================================
// Configuration Constants
// ============================================================================

export const CONFIG = {
  // System
  VERSION: "0.1.2",
  SCHEMA_VERSION: "0.1.2",

  // Timing
  LOCK_TTL_SECONDS: 300, // 5 minutes
  CRON_SCHEDULE: "0 */6 * * *", // Every 6 hours
  NOTIFICATION_COOLDOWN_HOURS: 6,

  // Limits
  MAX_PAYLOAD_SIZE_BYTES: 1_000_000, // 1MB
  FETCH_TIMEOUT_MS: 30_000, // 30 seconds
  MAX_RETRIES: 3,
  MAX_DEALS_PER_RUN: 1000,

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

  // KV keys
  KV_KEYS: {
    PROD_SNAPSHOT: "snapshot:prod",
    STAGING_SNAPSHOT: "snapshot:staging",
    LAST_RUN: "meta:last_run",
    METRICS: "meta:metrics",
  },
} as const;

// ============================================================================
// Default Source Registry
// ============================================================================

export const DEFAULT_SOURCES = [
  {
    domain: "trading212.com",
    url_patterns: ["/invite/*", "/referral/*"],
    selectors: {
      code: "[data-ref-code], .referral-code, .invite-code",
      reward: ".reward-amount, [data-reward], .bonus-value",
    },
    trust_initial: 0.7,
    classification: "probationary" as const,
    active: true,
  },
  {
    domain: "robinhood.com",
    url_patterns: ["/referral/*", "/invite/*"],
    selectors: {
      code: "[data-code], .referral-code",
      reward: ".reward-value",
    },
    trust_initial: 0.8,
    classification: "probationary" as const,
    active: true,
  },
  {
    domain: "webull.com",
    url_patterns: ["/activity/invite/*"],
    selectors: {
      code: ".invite-code, [data-invite]",
      reward: ".bonus-amount",
    },
    trust_initial: 0.7,
    classification: "probationary" as const,
    active: true,
  },
  {
    domain: "public.com",
    url_patterns: ["/referral/*"],
    selectors: {
      code: ".ref-code",
      reward: ".stock-value",
    },
    trust_initial: 0.7,
    classification: "probationary" as const,
    active: true,
  },
  {
    domain: "moomoo.com",
    url_patterns: ["/invite/*", "/referral/*"],
    selectors: {
      code: ".invite-code, [data-invite-code]",
      reward: ".bonus-value",
    },
    trust_initial: 0.7,
    classification: "probationary" as const,
    active: true,
  },
];

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
