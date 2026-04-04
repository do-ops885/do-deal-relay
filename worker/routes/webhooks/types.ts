// ============================================================================
// Webhook Routes - Type Definitions
// ============================================================================

import type {
  WebhookEventType,
  RetryPolicy,
  WebhookFilters,
} from "../../lib/webhook/index";

// Re-export types from webhook-handler for convenience
export type { WebhookEventType, RetryPolicy, WebhookFilters };

// ============================================================================
// Request Body Types
// ============================================================================

export interface SubscribeRequest {
  url: string;
  events: string[];
  partner_id?: string;
  metadata?: Record<string, unknown>;
  retry_policy?: Partial<RetryPolicy>;
  filters?: WebhookFilters;
}

export interface CreatePartnerRequest {
  name: string;
  allowed_events?: WebhookEventType[];
  rate_limit_per_minute?: number;
}

export interface CreateSyncConfigRequest {
  partner_id: string;
  direction: "push" | "pull" | "bidirectional";
  mode: "realtime" | "scheduled" | "manual";
  schedule?: { cron: string; timezone: string };
  conflict_resolution?: "timestamp" | "priority" | "manual";
  priority?: "local" | "remote";
  filters?: WebhookFilters;
  field_mapping?: Record<string, string>;
}

export interface UnsubscribeRequest {
  subscription_id: string;
}

// ============================================================================
// Valid Event Types
// ============================================================================

export const VALID_WEBHOOK_EVENTS: WebhookEventType[] = [
  "referral.created",
  "referral.updated",
  "referral.deactivated",
  "referral.expired",
  "referral.validated",
  "referral.quarantined",
  "ping",
];

// ============================================================================
// Utilities
// ============================================================================

export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Idempotency-Key",
    },
  });
}
