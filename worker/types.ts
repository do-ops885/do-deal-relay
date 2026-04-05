import { z } from "zod";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";

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
  metrics?: PipelineMetrics;
  snapshot?: Snapshot;
  previous_snapshot?: Snapshot;
  errors: Array<{ phase: string; error: Error }>;
  retry_count: number;
}

// ============================================================================
// Pipeline Metrics Types
// ============================================================================

export interface PipelineMetrics {
  run_id: string;
  start_time: number;
  end_time?: number;
  phase_timings: Record<PipelinePhase, number>;
  total_duration_ms: number;
  deals_processed: {
    discovered: number;
    normalized: number;
    deduped: number;
    validated: number;
    scored: number;
    published: number;
  };
  validation_cache?: {
    hit_total: number;
    miss_total: number;
    write_total: number;
    d1_lookup_total: number;
    dedup_hit_total: number;
  };
  errors: number;
  retries: number;
  success: boolean;
  final_phase: PipelinePhase;
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
    | "system_error"
    | "deal_expiring"
    | "deal_expired"
    | "pipeline_complete";
  severity: "info" | "warning" | "critical";
  run_id: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface Env {
  DEALS_PROD: KVNamespace;
  DEALS_STAGING: KVNamespace;
  DEALS_LOG: KVNamespace;
  DEALS_LOCK: KVNamespace;
  DEALS_SOURCES: KVNamespace;
  DEALS_DB?: D1Database;
  DEALS_WEBHOOKS?: KVNamespace;
  WEBHOOK_API_KEYS?: KVNamespace;
  AI?: Ai;
  ENVIRONMENT: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
  NOTIFICATION_THRESHOLD: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  EMAIL_WEBHOOK_SECRET?: string;
  // D1 Migration Feature Flags
  USE_D1_READS?: string;
  DISABLE_DUAL_WRITE?: string;
  ENABLE_VALIDATION_CACHE?: string;
}

// ============================================================================
// Health & Metrics Types
// ============================================================================

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  checks: {
    kv_connection: boolean;
    last_run_success: boolean;
    snapshot_valid: boolean;
  };
  components?: {
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
    };
  };
  metrics?: {
    total_runs_24h: number;
    success_rate_24h: number;
    avg_deals_per_run: number;
  };
  last_run?: {
    run_id: string;
    timestamp: string;
    duration_ms: number;
    deals_count: number;
  };
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

// ============================================================================
// Referral System Types
// ============================================================================

export interface ReferralInput {
  id?: string;
  url: string;
  code: string;
  domain?: string;
  description?: string;
  reward?: string;
  expiry_date?: string;
  source?: string;
  status?: string;
  submitted_at?: string;
  submitted_by?: string;
  expires_at?: string;
  deactivated_at?: string;
  deactivated_reason?: string;
  related_codes?: string[];
  metadata?: {
    title?: string;
    description?: string;
    reward_type?: string;
    reward_value?: string | number;
    category?: string[];
    tags?: string[];
    requirements?: string[];
    confidence_score?: number;
    notes?: string;
    research_sources?: string[];
    [key: string]: unknown;
  };
  validation?: {
    last_validated?: string;
    is_valid?: boolean;
    checked_urls?: string[];
  };
}

export interface ReferralDeactivateBody {
  id: string;
  reason?: string;
  replaced_by?: string;
  notes?: string;
}

export interface ReferralSearchQuery {
  q?: string;
  domain?: string;
  status?: "active" | "inactive" | "expired" | "all";
  category?: string;
  source?: string;
  active_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface ReferralResearchResult {
  query: string;
  domain: string;
  discovered_codes: Array<{
    code: string;
    url: string;
    source: string;
    discovered_at: string;
    reward_summary?: string;
    confidence: number;
  }>;
  research_metadata: {
    sources_checked: string[];
    search_queries: string[];
    research_duration_ms: number;
    agent_id: string;
    errors?: string[];
    used_real_fetching?: boolean;
  };
}

export interface WebResearchRequest {
  query: string;
  url?: string;
  domain?: string;
  depth?: "quick" | "thorough" | "deep";
  sources?: string[];
  max_results?: number;
  options?: {
    use_real_fetching?: boolean;
    skip_cache?: boolean;
    timeout_ms?: number;
  };
}

export interface ExpiringDeal {
  deal: Deal;
  daysUntilExpiry: number;
  notificationWindow: "7d" | "30d" | "90d";
}

// Schemas
export const ReferralInputSchema = z.object({
  id: z.string().optional(),
  url: z.string().url(),
  code: z.string().min(1),
  description: z.string().optional(),
  reward: z.string().optional(),
  expiry_date: z.string().datetime().optional(),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ReferralDeactivateBodySchema = z.object({
  id: z.string(),
  reason: z.string().optional(),
  replaced_by: z.string().optional(),
  notes: z.string().optional(),
});

export const ReferralSearchQuerySchema = z.object({
  q: z.string().optional(),
  domain: z.string().optional(),
  status: z.enum(["active", "inactive", "expired", "all"]).optional(),
  category: z.string().optional(),
  source: z.string().optional(),
  active_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const WebResearchRequestSchema = z.object({
  query: z.string(),
  url: z.string().url().optional(),
  domain: z.string().optional(),
  depth: z.enum(["quick", "thorough", "deep"]).optional(),
  sources: z.array(z.string()).optional(),
  max_results: z.number().int().min(1).max(100).optional(),
  options: z
    .object({
      use_real_fetching: z.boolean().optional(),
      skip_cache: z.boolean().optional(),
      timeout_ms: z.number().int().min(1000).max(60000).optional(),
    })
    .optional(),
});

// ============================================================================
// Experience Feedback System Types
// ============================================================================

export const ExperienceEventTypeSchema = z.enum([
  "click",
  "view",
  "conversion",
  "feedback",
]);

export type ExperienceEventType = z.infer<typeof ExperienceEventTypeSchema>;

export const ExperienceEventInputSchema = z.object({
  deal_code: z.string().min(1),
  event_type: ExperienceEventTypeSchema,
  agent_id: z.string().optional(),
  score: z.number().int().min(-100).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ExperienceEventInput = z.infer<typeof ExperienceEventInputSchema>;

export interface ExperienceEvent {
  id: string;
  deal_code: string;
  event_type: string;
  agent_id: string | null;
  score: number | null;
  metadata: string | null;
  created_at: number;
}

export interface ExperienceAggregate {
  deal_code: string;
  total_events: number;
  positive_events: number;
  negative_events: number;
  avg_score: number;
  last_updated: number;
}
