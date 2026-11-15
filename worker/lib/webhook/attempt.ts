// ============================================================================
// Webhook Delivery Attempt - Single outbound attempt and retry timing
// ============================================================================

import type { Env } from "../../types";
import type {
  WebhookEvent,
  WebhookSubscription,
  WebhookAttempt,
} from "./types";
import { generateWebhookHeaders } from "../hmac";
import { toError } from "../sanitize-error";
import {
  OutboundEgressPolicyError,
  parseTrustedEgressHosts,
} from "../egress-policy";
import { validatedFetch } from "../security";

/**
 * Delivery-related magic numbers and system policy constants.
 *
 * Holds system configuration parameters for outgoing webhook dispatch and retry attempts,
 * including error response size limits, record expiration durations, and exponential backoff jitter.
 */
export const DELIVERY_CONSTANTS = {
  /**
   * The maximum error response payload size (10KB) allowed to be read and stored in
   * the attempt record before being truncated, avoiding potential out-of-memory errors.
   */
  MAX_ERROR_RESPONSE_SIZE: 10 * 1024, // 10KB
  /**
   * Storage expiration TTL (7 days) for a successful/completed webhook delivery record in KV.
   */
  DELIVERY_RECORD_EXPIRATION_SECONDS: 7 * 24 * 60 * 60, // 7 days
  /**
   * Storage expiration TTL (30 days) for failed delivery events placed in the Dead Letter Queue.
   */
  DLQ_EXPIRATION_SECONDS: 30 * 24 * 60 * 60, // 30 days
  /**
   * The maximum upper bound of randomized delay jitter in milliseconds to avoid thundering herds.
   */
  MAX_JITTER_MS: 1000,
} as const;

export interface WebhookAttemptResult {
  status: "delivered" | "retryable" | "permanent";
  attempt: WebhookAttempt;
}

/**
 * Perform a single outbound delivery attempt.
 *
 * 2xx is success. Egress-policy violations and non-retryable 4xx responses are
 * permanent; network errors, 408, 429, and 5xx responses are retryable.
 */
export async function deliverWebhookAttempt(
  env: Env,
  event: WebhookEvent,
  subscription: WebhookSubscription,
): Promise<WebhookAttemptResult> {
  const payload = JSON.stringify(event);
  const trustedHosts = parseTrustedEgressHosts(
    env.OUTBOUND_EGRESS_ALLOWED_HOSTS,
  );

  try {
    const headers = await generateWebhookHeaders(
      payload,
      subscription.secret,
      event.id,
      event.type,
    );

    const response = await validatedFetch(
      subscription.url,
      {
        method: "POST",
        headers,
        body: payload,
      },
      trustedHosts,
    );

    const attempt: WebhookAttempt = {
      timestamp: new Date().toISOString(),
      status_code: response.status,
    };

    if (response.status >= 200 && response.status < 300) {
      return { status: "delivered", attempt };
    }

    // Check Content-Length before reading to avoid memory issues with large error responses
    const contentLength = response.headers.get("content-length");
    const maxErrorSize = DELIVERY_CONSTANTS.MAX_ERROR_RESPONSE_SIZE;

    if (contentLength && parseInt(contentLength, 10) > maxErrorSize) {
      attempt.response_body = `Error response too large (${contentLength} bytes)`;
    } else {
      attempt.response_body = await response.text();
    }

    const permanent =
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429;

    return { status: permanent ? "permanent" : "retryable", attempt };
  } catch (error) {
    const err = toError(error);
    const attempt: WebhookAttempt = {
      timestamp: new Date().toISOString(),
      error: err.message,
    };
    if (error instanceof OutboundEgressPolicyError) {
      return { status: "permanent", attempt };
    }
    return { status: "retryable", attempt };
  }
}

/**
 * Calculates exponential backoff with random jitter for a given retry attempt.
 *
 * @param attempt - The current retry attempt (1-based).
 * @param policy - The retry configuration policy containing delay parameters.
 * @param policy.initial_delay_ms - Base delay in milliseconds for the first retry.
 * @param policy.backoff_multiplier - Rate at which delay increases per attempt.
 * @param policy.max_delay_ms - The maximum delay bound in milliseconds.
 * @returns Calculated delay in milliseconds (capped at max_delay_ms).
 */
export function calculateBackoff(
  attempt: number,
  policy: {
    initial_delay_ms: number;
    backoff_multiplier: number;
    max_delay_ms: number;
  },
): number {
  const base = policy.initial_delay_ms;
  const multiplier = Math.pow(policy.backoff_multiplier, attempt - 1);
  // Use crypto for jitter to satisfy static analysis; not security-sensitive, just adds randomness to prevent thundering herd
  const randomBytes = crypto.getRandomValues(new Uint32Array(1));
  const jitter =
    ((randomBytes[0] ?? 0) / 0xffffffff) * DELIVERY_CONSTANTS.MAX_JITTER_MS;

  return Math.min(base * multiplier + jitter, policy.max_delay_ms);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
