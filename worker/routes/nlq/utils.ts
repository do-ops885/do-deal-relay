/**
 * NLQ Route Utilities
 *
 * Helper functions for the NLQ route handlers.
 */

import type { Env } from "../../types";
import { createStructuredLogger } from "../../lib/logger";

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

import { CONFIG } from "../../config";

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
