// ============================================================================
// Webhook Delivery - Event delivery and retry logic
// ============================================================================

import type { Env } from "../../types";
import type {
  WebhookEvent,
  WebhookSubscription,
  WebhookDelivery,
  WebhookAttempt,
  DeadLetterEvent,
} from "./types";
import { getWebhookKV, generateId, DEFAULT_RETRY_POLICY } from "./types";
import { getSubscription } from "./subscriptions";
import { generateWebhookHeaders } from "../hmac";
import { toError } from "../sanitize-error";
import { logger } from "../global-logger";
import { fetchInBatches } from "../utils";
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

// ============================================================================
// Outgoing Webhooks
// ============================================================================

/**
 * Dispatches a webhook event to all active matching partner subscriptions.
 * Evaluates subscription filters (e.g. domain and status filters) before sending.
 *
 * @param env - Worker environment with KV bindings.
 * @param event - The WebhookEvent payload to deliver.
 * @returns A promise that resolves when delivery processing is complete.
 */
export async function sendOutgoingWebhooks(
  env: Env,
  event: WebhookEvent,
): Promise<void> {
  // Get all active subscriptions that want this event
  const allSubscriptions = await getAllActiveSubscriptions(env);
  const matchingSubscriptions = allSubscriptions.filter(
    (sub) =>
      sub.events.includes(event.type) &&
      isEventAllowedByFilters(event, sub.filters),
  );

  logger.info(
    `Sending outgoing webhooks: ${matchingSubscriptions.length} subscriptions`,
    {
      component: "webhook",
      event_type: event.type,
      event_id: event.id,
    },
  );

  // Send in parallel
  await Promise.all(
    matchingSubscriptions.map((sub) =>
      sendWebhookToSubscription(env, event, sub),
    ),
  );
}

async function getAllActiveSubscriptions(
  env: Env,
): Promise<WebhookSubscription[]> {
  try {
    const kv = getWebhookKV(env);
    if (!kv) return [];

    // List all subscription keys
    const listResult = await kv.list({ prefix: "webhook_subscription:" });

    // Optimization: Parallel batch fetch instead of sequential loop
    // This reduces latency from O(N) to O(N/batchSize)
    const subscriptions = await fetchInBatches<
      { name: string },
      WebhookSubscription
    >(listResult.keys, (key) => kv.get<WebhookSubscription>(key.name, "json"));

    // Filter for non-null results first to be safe, then check if active
    return subscriptions.filter((sub) => sub && sub.active);
  } catch (error) {
    const err = toError(error);
    logger.error("Failed to get all active subscriptions", {
      component: "webhook",
      error: err.message,
    });
    return [];
  }
}

function isEventAllowedByFilters(
  event: WebhookEvent,
  filters?: { domains?: string[]; status?: string[] },
): boolean {
  if (!filters) return true;

  const data = event.data as { domain?: string; status?: string };

  if (filters.domains && filters.domains.length > 0 && data.domain) {
    if (!filters.domains.includes(data.domain)) return false;
  }

  if (filters.status && filters.status.length > 0 && data.status) {
    if (!filters.status.includes(data.status)) return false;
  }

  return true;
}

async function sendWebhookToSubscription(
  env: Env,
  event: WebhookEvent,
  subscription: WebhookSubscription,
): Promise<void> {
  const payload = JSON.stringify(event);
  const retryPolicy = subscription.retry_policy || DEFAULT_RETRY_POLICY;

  const delivery: WebhookDelivery = {
    event_id: event.id,
    subscription_id: subscription.id,
    status: "pending",
    attempts: [],
    created_at: new Date().toISOString(),
  };

  for (let attempt = 1; attempt <= retryPolicy.max_attempts; attempt++) {
    try {
      const headers = await generateWebhookHeaders(
        payload,
        subscription.secret,
        event.id,
        event.type,
      );

      const response = await validatedFetch(subscription.url, {
        method: "POST",
        headers,
        body: payload,
      });

      const attemptRecord: WebhookAttempt = {
        timestamp: new Date().toISOString(),
        status_code: response.status,
      };

      if (response.status >= 200 && response.status < 300) {
        // Success
        delivery.status = "delivered";
        delivery.delivered_at = attemptRecord.timestamp;
        delivery.attempts.push(attemptRecord);

        logger.info(`Webhook delivered: ${event.id} to ${subscription.url}`, {
          component: "webhook",
          event_id: event.id,
          subscription_id: subscription.id,
          attempts: attempt,
        });

        break;
      } else {
        // Failed - retry
        // Check Content-Length before reading to avoid memory issues with large error responses
        const contentLength = response.headers.get("content-length");
        const maxErrorSize = DELIVERY_CONSTANTS.MAX_ERROR_RESPONSE_SIZE;

        if (contentLength && parseInt(contentLength, 10) > maxErrorSize) {
          attemptRecord.response_body = `Error response too large (${contentLength} bytes)`;
        } else {
          attemptRecord.response_body = await response.text();
        }
        delivery.attempts.push(attemptRecord);
        delivery.status =
          attempt < retryPolicy.max_attempts ? "retrying" : "failed";

        if (attempt < retryPolicy.max_attempts) {
          const delay = calculateBackoff(attempt, retryPolicy);
          await sleep(delay);
        }
      }
    } catch (error) {
      const err = toError(error);
      const attemptRecord: WebhookAttempt = {
        timestamp: new Date().toISOString(),
        error: err.message,
      };
      delivery.attempts.push(attemptRecord);
      delivery.status =
        attempt < retryPolicy.max_attempts ? "retrying" : "failed";

      if (attempt < retryPolicy.max_attempts) {
        const delay = calculateBackoff(attempt, retryPolicy);
        await sleep(delay);
      }
    }
  }

  // Save delivery record
  const kv = getWebhookKV(env);
  if (kv) {
    await kv.put(
      `webhook_delivery:${delivery.event_id}:${subscription.id}`,
      JSON.stringify(delivery),
      { expirationTtl: DELIVERY_CONSTANTS.DELIVERY_RECORD_EXPIRATION_SECONDS },
    );
  }

  // If failed after all retries, add to dead letter queue
  if (delivery.status === "failed") {
    await addToDeadLetterQueue(env, delivery, event);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Dead Letter Queue
// ============================================================================

async function addToDeadLetterQueue(
  env: Env,
  delivery: WebhookDelivery,
  event: WebhookEvent,
): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;

  const dlqEntry: DeadLetterEvent = {
    delivery,
    event,
    enqueued_at: new Date().toISOString(),
    retryable: true,
  };

  await kv.put(
    `webhook_dlq:${delivery.event_id}:${delivery.subscription_id}`,
    JSON.stringify(dlqEntry),
    { expirationTtl: DELIVERY_CONSTANTS.DLQ_EXPIRATION_SECONDS },
  );

  logger.warn(`Webhook added to DLQ: ${delivery.event_id}`, {
    component: "webhook",
    event_id: delivery.event_id,
    subscription_id: delivery.subscription_id,
    attempts: delivery.attempts.length,
  });
}

/**
 * Retrieves all events currently in the Dead Letter Queue.
 *
 * @param env - Worker environment with KV bindings.
 * @returns A list of enqueued webhook delivery failures.
 */
export async function getDeadLetterQueue(env: Env): Promise<DeadLetterEvent[]> {
  try {
    const kv = getWebhookKV(env);
    if (!kv) return [];

    const listResult = await kv.list({ prefix: "webhook_dlq:" });

    // Optimization: Parallel batch fetch instead of sequential loop
    // This reduces latency from O(N) to O(N/batchSize)
    const entries = await fetchInBatches<{ name: string }, DeadLetterEvent>(
      listResult.keys,
      (key) => kv.get<DeadLetterEvent>(key.name, "json"),
    );

    // Filter out potential null results (safe check)
    return entries.filter((entry) => entry !== null);
  } catch (error) {
    const err = toError(error);
    logger.error("Failed to get dead letter queue", {
      component: "webhook",
      error: err.message,
    });
    return [];
  }
}

/**
 * Retries delivery for a specific event from the Dead Letter Queue.
 * If successful, the event is removed from the DLQ.
 *
 * @param env - Worker environment with KV bindings.
 * @param eventId - Unique ID of the failed event.
 * @param subscriptionId - ID of the subscription that failed.
 * @returns True if retry was initiated, false if event/subscription not found.
 */
export async function retryDeadLetterEvent(
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<boolean> {
  const kv = getWebhookKV(env);
  if (!kv) return false;

  const key = `webhook_dlq:${eventId}:${subscriptionId}`;
  const data = await kv.get(key);
  if (!data) return false;

  const dlqEntry = JSON.parse(data) as DeadLetterEvent;

  // Delete from DLQ
  await kv.delete(key);

  // Retry sending
  const subscription = await getSubscription(env, subscriptionId);
  if (!subscription || !subscription.active) return false;

  await sendWebhookToSubscription(env, dlqEntry.event, subscription);
  return true;
}
