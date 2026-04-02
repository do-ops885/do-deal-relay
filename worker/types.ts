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
    | "system_error"
    | "deal_expiring"
    | "deal_expired";
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
  ENVIRONMENT: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
  NOTIFICATION_THRESHOLD: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  EMAIL_WEBHOOK_SECRET?: string;
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
  description?: string;
  reward?: string;
  expiry_date?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ReferralDeactivateBody {
  id: string;
  reason?: string;
}

export interface ReferralSearchQuery {
  q?: string;
  source?: string;
  active_only?: boolean;
  limit?: number;
}

export interface ReferralResearchResult {
  url: string;
  code?: string;
  description?: string;
  reward?: string;
  expiry_date?: string;
  confidence: number;
  source: string;
}

export interface WebResearchRequest {
  query: string;
  url?: string;
  max_results?: number;
}

export interface ExpiringDeal {
  id: string;
  code: string;
  url: string;
  title?: string;
  expiry_date: string;
  days_remaining: number;
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
});

export const ReferralSearchQuerySchema = z.object({
  q: z.string().optional(),
  source: z.string().optional(),
  active_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const WebResearchRequestSchema = z.object({
  query: z.string(),
  url: z.string().url().optional(),
  max_results: z.number().int().min(1).max(10).optional(),
});
