import { z } from "zod";
import type { ComparisonFields } from "../pipeline/comparison";
import type { Deal, Snapshot } from "./deal";

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
  comparisonCache?: Map<string, ComparisonFields>;
}

// ============================================================================
// Pipeline Metrics Types
// ============================================================================

export interface PipelineMetrics {
  run_id: string;
  start_time: number;
  end_time?: number;
  phase_timings: Record<PipelinePhase, number>;
  phase_results: Record<PipelinePhase, "success" | "failure">;
  total_duration_ms: number;
  deals_processed: {
    discovered: number;
    passed_trust_filter: number;
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
  validation_gate_rejections?: Record<string, number>;
  validation_gate_passes?: Record<string, number>;
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
