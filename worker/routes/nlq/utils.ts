/**
 * NLQ Route Utilities
 *
 * Helper functions for the NLQ route handlers.
 */

import type { Env } from "../../types";
import { createStructuredLogger } from "../../lib/logger";
import { CONFIG } from "../../config";
import type { ParsedQuery } from "../../lib/nlq/types";
import {
  logAIInteraction,
  NLQ_COMPLIANCE_OPERATION,
} from "../../lib/research-agent/compliance-log";

export const ENDPOINT_PATH = "/api/nlq";

/**
 * Generate a trace ID for NLQ requests
 */
export function generateTraceId(): string {
  return `nlq-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get the NLQ logger instance
 */
export function getNLQLogger(env: Env, traceId: string) {
  return createStructuredLogger(env, "nlq-route", traceId);
}

/**
 * Default rate limit configuration
 */
export function getRateLimitConfig() {
  return {
    maxRequests: CONFIG.NLQ_RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
    keyPrefix: "ratelimit:nlq",
  };
}

/**
 * Emit one fire-and-forget EU AI Act compliance event per processed NLQ
 * request. Only the query shape and a content hash are recorded; the raw
 * query text is never persisted (data minimization). Logging failures are
 * swallowed inside logAIInteraction and can never fail the request.
 */
export function recordNlqCompliance(
  env: Env,
  traceId: string,
  queryText: string,
  parsed: ParsedQuery,
  resultCount: number,
  latencyMs: number,
): Promise<void> {
  return logAIInteraction(env.DEALS_DB, {
    operation: NLQ_COMPLIANCE_OPERATION,
    inputSource: "nlq_route",
    rawInput: queryText,
    inputDescription: `intent=${parsed.intent.intent};entities=${parsed.entities.length}`,
    inputMetadata: {
      intent: parsed.intent.intent,
      entity_count: parsed.entities.length,
      result_count: resultCount,
    },
    result: `success:${resultCount}`,
    confidence: parsed.intent.confidence,
    correlationId: traceId,
    latencyMs,
  });
}
