import { z } from "zod";
import type {
  KVNamespace,
  D1Database,
  VectorizeIndex,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";

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
    | "pipeline_complete"
    | "deal_health_check";
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
  DEALS_DB: D1Database;
  DEALS_WEBHOOKS?: KVNamespace;
  WEBHOOK_API_KEYS?: KVNamespace;
  AI?: Ai;
  AI_GATEWAY_URL: string;
  AI_GATEWAY_ENABLED?: string;
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_MODEL?: string;
  ENVIRONMENT: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
  TRUST_THRESHOLD: string;
  NOTIFICATION_THRESHOLD: string;
  CANDIDATE_BUDGET_GLOBAL?: string;
  CANDIDATE_BUDGET_PER_SOURCE?: string;
  CANDIDATE_BUDGET_HIGH_TRUST_BONUS?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USERNAME?: string;
  REDDIT_PASSWORD?: string;
  REDDIT_SUBREDDIT?: string;
  REDDIT_MIN_INVALID_COMMENTS?: string;
  REDDIT_SCORE_THRESHOLD?: string;
  REDDIT_LIFECYCLE_ENABLED?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  EMAIL_WEBHOOK_SECRET?: string;
  WEBHOOK_SECRET: string;
  API_ENCRYPTION_KEY: string;
  RESEARCH_USE_REAL_FETCHING?: string;
  _validated?: boolean;
  ALLOWED_ORIGINS?: string;
  // D1 Migration Feature Flags
  USE_D1_READS?: string;
  DISABLE_DUAL_WRITE?: string;
  ENABLE_VALIDATION_CACHE?: string;
  // Auth secrets
  JWT_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  // Vectorize index for semantic search (binding declared in wrangler.jsonc)
  DEAL_EMBEDDINGS?: VectorizeIndex;
  // Durable Objects for atomic concurrency control and stateful coordination
  PIPELINE_LOCK?: DurableObjectNamespace;
  SOURCE_REGISTRY?: DurableObjectNamespace;
  DEAL_REGISTRY?: DurableObjectNamespace;
  USE_PIPELINE_EXECUTOR?: string;
  PIPELINE_EXECUTOR?: DurableObjectNamespace;
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
}
