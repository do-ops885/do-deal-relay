import { z } from "zod";

// ============================================================================
// Core Deal Schema
// ============================================================================

export const RewardTypeSchema = z.enum(["cash", "credit", "percent", "item"]);

export const RewardSchema = z.object({
  type: RewardTypeSchema,
  value: z.union([z.number(), z.string()]),
  currency: z.string().optional(),
  description: z.string().optional(),
});

export const SourceSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  discovered_at: z.string().datetime(),
  trust_score: z.number().min(0).max(1),
});

export const ExpirySchema = z.object({
  date: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  type: z.enum(["hard", "soft", "unknown"]),
});

export const DealMetadataSchema = z.object({
  category: z.array(z.string()),
  tags: z.array(z.string()),
  normalized_at: z.string().datetime(),
  confidence_score: z.number().min(0),
  status: z.enum(["active", "quarantined", "rejected"]),
});

export const DealSchema = z.object({
  id: z.string(),
  source: SourceSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  code: z.string().min(1).max(100),
  url: z.string().url(),
  reward: RewardSchema,
  requirements: z.array(z.string()).optional(),
  expiry: ExpirySchema,
  metadata: DealMetadataSchema,
});

export type RewardType = z.infer<typeof RewardTypeSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Expiry = z.infer<typeof ExpirySchema>;
export type DealMetadata = z.infer<typeof DealMetadataSchema>;
export type Deal = z.infer<typeof DealSchema>;

// ============================================================================
// Snapshot Schema
// ============================================================================

export const SnapshotStatsSchema = z.object({
  total: z.number().int().min(0),
  active: z.number().int().min(0),
  quarantined: z.number().int().min(0),
  rejected: z.number().int().min(0),
  duplicates: z.number().int().min(0),
});

export const SnapshotSchema = z.object({
  version: z.string(),
  generated_at: z.string().datetime(),
  run_id: z.string(),
  trace_id: z.string(),
  snapshot_hash: z.string(),
  previous_hash: z.string(),
  schema_version: z.string(),
  stats: SnapshotStatsSchema,
  deals: z.array(DealSchema),
});

export type SnapshotStats = z.infer<typeof SnapshotStatsSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;

// ============================================================================
// Log Entry Schema
// ============================================================================

export const LogEntrySchema = z.object({
  run_id: z.string(),
  trace_id: z.string(),
  ts: z.string().datetime(),
  phase: z.enum([
    "init",
    "discover",
    "normalize",
    "dedupe",
    "validate",
    "score",
    "stage",
    "publish",
    "verify",
    "finalize",
    "revert",
    "quarantine",
  ]),
  status: z.enum(["complete", "incomplete", "error", "skipped"]),
  candidate_count: z.number().int().min(0).optional(),
  valid_count: z.number().int().min(0).optional(),
  duplicate_count: z.number().int().min(0).optional(),
  rejected_count: z.number().int().min(0).optional(),
  rejection_reasons: z.array(z.string()).optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  trust_score: z.number().min(0).max(1).optional(),
  source_urls: z.array(z.string()).optional(),
  source_hashes: z.array(z.string()).optional(),
  previous_snapshot_hash: z.string().optional(),
  new_snapshot_hash: z.string().optional(),
  duration_ms: z.number().int().min(0).optional(),
  retry_count: z.number().int().min(0).optional(),
  validator_versions: z.string().optional(),
  schema_version: z.string().optional(),
  notification_sent: z.boolean().optional(),
  error_class: z.string().optional(),
  error_message: z.string().optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

// ============================================================================
// Source Registry Schema
// ============================================================================

export const SourceClassificationSchema = z.enum([
  "trusted",
  "probationary",
  "unverified",
  "blocked",
]);

export const SourceConfigSchema = z.object({
  domain: z.string(),
  url_patterns: z.array(z.string()),
  selectors: z.record(z.string()).optional(),
  trust_initial: z.number().min(0).max(1),
  classification: SourceClassificationSchema,
  active: z.boolean(),
  last_discovery: z.string().datetime().optional(),
  discovery_count: z.number().int().min(0).optional(),
  validation_success_count: z.number().int().min(0).optional(),
  validation_failure_count: z.number().int().min(0).optional(),
});

export type SourceClassification = z.infer<typeof SourceClassificationSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

// ============================================================================
// State Machine Types
// ============================================================================

export const PipelinePhaseSchema = z.enum([
  "init",
  "discover",
  "normalize",
  "dedupe",
  "validate",
  "score",
  "stage",
  "publish",
  "verify",
  "finalize",
]);

export const FailurePathSchema = z.enum([
  "revert",
  "quarantine",
  "retry",
  "concurrency_abort",
  "skipped_locked",
]);

export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>;
export type FailurePath = z.infer<typeof FailurePathSchema>;

export interface PipelineContext {
  run_id: string;
  trace_id: string;
  start_time: number;
  candidates: Deal[];
  normalized: Deal[];
  deduped: Deal[];
  validated: Deal[];
  scored: Deal[];
  snapshot?: Snapshot;
  previous_snapshot?: Snapshot;
  errors: Array<{ phase: string; error: Error }>;
  retry_count: number;
}

// ============================================================================
// Error Taxonomy
// ============================================================================

export const ErrorClassSchema = z.enum([
  "FetchError",
  "ParseError",
  "ValidationError",
  "ScoringError",
  "PublishError",
  "NotificationError",
  "ConcurrencyError",
  "ConfigError",
]);

export type ErrorClass = z.infer<typeof ErrorClassSchema>;

export class PipelineError extends Error {
  constructor(
    public readonly errorClass: ErrorClass,
    message: string,
    public readonly phase: PipelinePhase,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export const GetDealsQuerySchema = z.object({
  category: z.string().optional(),
  min_reward: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export const SubmitDealBodySchema = z.object({
  url: z.string().url(),
  code: z.string().min(1),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type GetDealsQuery = z.infer<typeof GetDealsQuerySchema>;
export type SubmitDealBody = z.infer<typeof SubmitDealBodySchema>;

// ============================================================================
// Environment Types
// ============================================================================

export interface NotificationEvent {
  type:
    | "checks_failed"
    | "publish_incomplete"
    | "concurrency_abort"
    | "high_value_deal"
    | "trust_anomaly"
    | "system_error";
  severity: "info" | "warning" | "critical";
  run_id: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface Env {
  // KV Namespaces
  DEALS_PROD: KVNamespace;
  DEALS_STAGING: KVNamespace;
  DEALS_LOG: KVNamespace;
  DEALS_LOCK: KVNamespace;
  DEALS_SOURCES: KVNamespace;
  DEALS_REFERRALS?: KVNamespace;
  DEALS_WEBHOOKS?: KVNamespace;

  // D1 Database (EU AI Act logging + advanced queries)
  DEALS_DB?: D1Database;

  // Environment & Config
  ENVIRONMENT: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
  NOTIFICATION_THRESHOLD: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  EMAIL_WEBHOOK_SECRET?: string;
  WEBHOOK_API_KEYS?: string; // Comma-separated list of allowed API keys
}

// ============================================================================
// Health & Metrics Types
// ============================================================================

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  components: {
    kv_stores: {
      deals_prod: boolean;
      deals_staging: boolean;
      deals_log: boolean;
      deals_lock: boolean;
      deals_sources: boolean;
    };
    pipeline: {
      last_run: string;
      last_success: boolean;
      average_duration_ms: number;
    };
    external_services: {
      github_api: boolean;
      telegram_api?: boolean;
    };
  };
  metrics: {
    total_runs_24h: number;
    success_rate_24h: number;
    avg_deals_per_run: number;
  };
}

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  components: HealthStatus["components"];
  metrics: HealthStatus["metrics"];
}

export interface Metrics {
  deals_runs_total: number;
  deals_publish_success_total: number;
  deals_candidate_deals_total: number;
  deals_valid_deals_total: number;
  deals_duplicate_deals_total: number;
  deals_notification_total: number;
  deals_fetch_latency_ms: number;
  deals_validator_failures_total: number;
}

// ============================================================================
// Referral Input Management Schema
// ============================================================================

export const ReferralInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).max(100),
  url: z.string().url(),
  domain: z.string().min(1),
  source: z.enum(["manual", "web_research", "api", "discovered"]),
  status: z.enum(["active", "inactive", "expired", "quarantined"]),
  submitted_at: z.string().datetime(),
  submitted_by: z.string().optional(),
  expires_at: z.string().datetime().optional(),
  deactivated_at: z.string().datetime().optional(),
  deactivated_reason: z
    .enum(["user_request", "expired", "invalid", "violation", "replaced"])
    .optional(),
  metadata: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    reward_type: z.enum(["cash", "credit", "percent", "item", "unknown"]),
    reward_value: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    category: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    requirements: z.array(z.string()).default([]),
    research_sources: z.array(z.string()).optional(),
    confidence_score: z.number().min(0).max(1).default(0.5),
    notes: z.string().optional(),
  }),
  validation: z
    .object({
      last_validated: z.string().datetime().optional(),
      is_valid: z.boolean().optional(),
      validation_errors: z.array(z.string()).optional(),
      checked_urls: z.array(z.string()).optional(),
    })
    .optional(),
  related_codes: z.array(z.string()).optional(), // For tracking variations
});

export const ReferralResearchResultSchema = z.object({
  query: z.string(),
  domain: z.string(),
  discovered_codes: z.array(
    z.object({
      code: z.string(),
      url: z.string().url(),
      source: z.string(),
      discovered_at: z.string().datetime(),
      reward_summary: z.string().optional(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  research_metadata: z.object({
    sources_checked: z.array(z.string()),
    search_queries: z.array(z.string()),
    research_duration_ms: z.number(),
    agent_id: z.string(),
  }),
});

export const ReferralDeactivateBodySchema = z.object({
  code: z.string().min(1),
  reason: z.enum([
    "user_request",
    "expired",
    "invalid",
    "violation",
    "replaced",
  ]),
  replaced_by: z.string().optional(), // New code that replaces this one
  notes: z.string().optional(),
});

export const ReferralSearchQuerySchema = z.object({
  domain: z.string().optional(),
  status: z
    .enum(["active", "inactive", "expired", "quarantined", "all"])
    .default("all"),
  category: z.string().optional(),
  source: z
    .enum(["manual", "web_research", "api", "discovered", "all"])
    .default("all"),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const WebResearchRequestSchema = z.object({
  query: z.string().min(1),
  domain: z.string().optional(),
  depth: z.enum(["quick", "thorough", "deep"]).default("thorough"),
  sources: z
    .array(
      z.enum([
        "producthunt",
        "github",
        "hackernews",
        "reddit",
        "twitter",
        "company_site",
        "all",
      ]),
    )
    .default(["all"]),
  max_results: z.coerce.number().int().min(1).max(100).default(20),
});

export type ReferralInput = z.infer<typeof ReferralInputSchema>;
export type ReferralResearchResult = z.infer<
  typeof ReferralResearchResultSchema
>;
export type ReferralDeactivateBody = z.infer<
  typeof ReferralDeactivateBodySchema
>;
export type ReferralSearchQuery = z.infer<typeof ReferralSearchQuerySchema>;
export type WebResearchRequest = z.infer<typeof WebResearchRequestSchema>;

// ============================================================================
// GOAP World State
// ============================================================================

export interface WorldState {
  repo_created: boolean;
  discovery_files_live: boolean;
  mcp_server_deployed: boolean;
  a2a_card_live: boolean;
  deals_seeded: boolean;
  research_loop_active: boolean;
  notification_active: boolean;
  registries_published: boolean;
}

export type WorldStateKey = keyof WorldState;

export interface GOAPAction {
  name: string;
  preconditions: Partial<WorldState>;
  effects: Partial<WorldState>;
  cost: number;
}
