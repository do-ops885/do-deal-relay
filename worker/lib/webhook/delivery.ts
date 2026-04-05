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
import { logger } from "../global-logger";
import { fetchInBatches } from "../utils";

// ============================================================================
// Outgoing Webhooks
// ============================================================================

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
    logger.error("Failed to get all active subscriptions", {
      component: "webhook",
      error: (error as Error).message,
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

      const response = await fetch(subscription.url, {
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
        const maxErrorSize = 10 * 1024; // 10KB limit for webhook error responses

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
      const attemptRecord: WebhookAttempt = {
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
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
      { expirationTtl: 7 * 24 * 60 * 60 }, // 7 days
    );
  }

  // If failed after all retries, add to dead letter queue
  if (delivery.status === "failed") {
    await addToDeadLetterQueue(env, delivery, event);
  }
}

function calculateBackoff(
  attempt: number,
  policy: {
    initial_delay_ms: number;
    backoff_multiplier: number;
    max_delay_ms: number;
  },
): number {
  const base = policy.initial_delay_ms;
  const multiplier = Math.pow(policy.backoff_multiplier, attempt - 1);
  // Math.random() is acceptable here for jitter - not security-sensitive, just adds randomness to prevent thundering herd
  const jitter = Math.random() * 1000;

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
    { expirationTtl: 30 * 24 * 60 * 60 }, // 30 days
  );

  logger.warn(`Webhook added to DLQ: ${delivery.event_id}`, {
    component: "webhook",
    event_id: delivery.event_id,
    subscription_id: delivery.subscription_id,
    attempts: delivery.attempts.length,
  });
}

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
    logger.error("Failed to get dead letter queue", {
      component: "webhook",
      error: (error as Error).message,
    });
    return [];
  }
}

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
