// ============================================================================
// Webhook Types - All type definitions for webhook system
// ============================================================================

import type { Env } from "../../types";

export interface WebhookSubscription {
  id: string;
  partner_id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  retry_policy?: RetryPolicy;
  filters?: WebhookFilters;
}

export type WebhookEventType =
  | "referral.created"
  | "referral.updated"
  | "referral.deactivated"
  | "referral.expired"
  | "referral.validated"
  | "referral.quarantined"
  | "ping";

export interface RetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
}

export interface WebhookFilters {
  domains?: string[];
  status?: string[];
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: unknown;
  metadata: {
    partner_id?: string;
    request_id: string;
    trace_id: string;
  };
}

export interface WebhookDelivery {
  event_id: string;
  subscription_id: string;
  status: "pending" | "delivered" | "failed" | "retrying";
  attempts: WebhookAttempt[];
  created_at: string;
  delivered_at?: string;
}

export interface WebhookAttempt {
  timestamp: string;
  status_code?: number;
  error?: string;
  response_body?: string;
}

export interface IncomingWebhookPayload {
  event: WebhookEventType;
  data: ReferralWebhookData;
  external_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ReferralWebhookData {
  code: string;
  url: string;
  domain: string;
  title?: string;
  description?: string;
  reward?: {
    type: "cash" | "credit" | "percent" | "item";
    value?: number | string;
    currency?: string;
  };
  expires_at?: string;
  metadata?: Record<string, unknown>;
  status?: "active" | "inactive" | "expired" | "quarantined";
}

export interface WebhookPartner {
  id: string;
  name: string;
  secret: string;
  active: boolean;
  allowed_events: WebhookEventType[];
  rate_limit_per_minute: number;
  created_at: string;
}

export interface IncomingWebhookResult {
  success: boolean;
  statusCode: number;
  message: string;
  referralId?: string;
  error?: string;
}

export interface SyncConfig {
  partner_id: string;
  direction: "push" | "pull" | "bidirectional";
  mode: "realtime" | "scheduled" | "manual";
  schedule?: {
    cron: string;
    timezone: string;
  };
  conflict_resolution: "timestamp" | "priority" | "manual";
  priority: "local" | "remote";
  filters?: {
    domains?: string[];
    status?: string[];
    created_after?: string;
  };
  field_mapping?: Record<string, string>;
}

export interface SyncState {
  partner_id: string;
  last_sync_at: string;
  cursor?: string;
  sync_version: number;
  pending_changes: number;
  last_error?: string;
  status: "idle" | "syncing" | "error";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface IdempotencyCheck {
  cached: boolean;
  referralId?: string;
}

export interface IdempotencyRecord {
  key: string;
  payload_hash: string;
  referral_id: string;
  created_at: string;
  expires_at: string;
}

export interface DeadLetterEvent {
  delivery: WebhookDelivery;
  event: WebhookEvent;
  enqueued_at: string;
  retryable: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_attempts: 5,
  initial_delay_ms: 1000,
  max_delay_ms: 60000,
  backoff_multiplier: 2,
};

export const WEBHOOK_RATE_LIMIT_TTL = 3600; // 1 hour

// ============================================================================
// KV Helper - Use DEALS_STAGING for webhook data
// ============================================================================

export function getWebhookKV(env: Env): KVNamespace | null {
  // Use DEALS_WEBHOOKS if available, otherwise fallback to DEALS_STAGING
  return env.DEALS_WEBHOOKS || env.DEALS_STAGING || null;
}

// ============================================================================
// Utilities
// ============================================================================

export function generateId(): string {
  // Using crypto.randomUUID() for secure ID generation instead of Math.random()
  return `${Date.now().toString(36)}_${crypto.randomUUID().split("-")[0]}`;
}
