// ============================================================================
// Webhook Delivery - Event dispatch and retry orchestration
// ============================================================================

import type { Env } from "../../types";
import type {
  WebhookEvent,
  WebhookSubscription,
  WebhookDelivery,
} from "./types";
import { getWebhookKV, DEFAULT_RETRY_POLICY } from "./types";
import { logger } from "../global-logger";
import { fetchInBatches } from "../utils";
import { listAllKvKeys } from "../kv-pagination";
import { toError } from "../sanitize-error";
import { calculateBackoff, deliverWebhookAttempt, sleep } from "./attempt";
import { getDeliveryRecord, persistDeliveryRecord } from "./records";
import { addToDeadLetterQueue } from "./dlq";
import {
  getWebhookQueue,
  webhookDeliveryId,
  WEBHOOK_QUEUE_MAX_BATCH,
  type WebhookQueueMessage,
} from "./queue";
import { recordWebhookMetric, WEBHOOK_METRICS } from "./metrics";

// Backward-compatible re-exports: this module was the single delivery entry
// point before the queue split, and routes/tests still import from it.
export {
  DELIVERY_CONSTANTS,
  calculateBackoff,
  deliverWebhookAttempt,
  type WebhookAttemptResult,
} from "./attempt";
export {
  deliveryRecordKey,
  getDeliveryRecord,
  getDeliveryRecordStatus,
  persistDeliveryRecord,
} from "./records";
export {
  addToDeadLetterQueue,
  getDeadLetterQueue,
  retryDeadLetterEvent,
} from "./dlq";

// ============================================================================
// Outgoing Webhooks
// ============================================================================

/**
 * Dispatches a webhook event to all active matching partner subscriptions.
 * Evaluates subscription filters (e.g. domain and status filters) before sending.
 *
 * When the webhook queue is bound, delivery is durably enqueued and this
 * function returns without waiting for subscriber network calls or retry
 * backoff. Without a queue binding it falls back to inline delivery.
 *
 * @param env - Worker environment with KV bindings.
 * @param event - The WebhookEvent payload to deliver.
 * @param preloadedSubscriptions - Optional subscription snapshot, so callers
 *   dispatching many events can load the list once instead of per event.
 * @returns A promise that resolves when delivery is accepted.
 */
export async function sendOutgoingWebhooks(
  env: Env,
  event: WebhookEvent,
  preloadedSubscriptions?: WebhookSubscription[],
): Promise<void> {
  const allSubscriptions =
    preloadedSubscriptions ?? (await getActiveWebhookSubscriptions(env));
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

  const queue = getWebhookQueue(env);
  if (queue && matchingSubscriptions.length > 0) {
    if (matchingSubscriptions.length <= WEBHOOK_QUEUE_MAX_BATCH) {
      try {
        await enqueueWebhookDeliveries(
          env,
          queue,
          event,
          matchingSubscriptions,
        );
        return;
      } catch (error) {
        logger.warn("Webhook enqueue failed; falling back to inline delivery", {
          component: "webhook",
          event_id: event.id,
          error: toError(error).message,
        });
      }
    } else {
      logger.warn("Webhook batch exceeds queue limit; using inline delivery", {
        component: "webhook",
        event_id: event.id,
        subscriptions: matchingSubscriptions.length,
        max_batch: WEBHOOK_QUEUE_MAX_BATCH,
      });
    }
  }

  // Fallback: send in parallel when no durable queue is bound (local/test).
  await Promise.all(
    matchingSubscriptions.map((sub) =>
      sendWebhookToSubscription(env, event, sub),
    ),
  );
}

/**
 * Persist the delivery identity, then enqueue one durable message per
 * subscription. Returns after the queue accepts the batch, without waiting for
 * subscriber network calls or retry backoff.
 *
 * Subscriptions whose delivery record is already `delivered` are skipped so a
 * redelivered event cannot reset a completed record back to `pending` and
 * notify the subscriber twice.
 */
async function enqueueWebhookDeliveries(
  env: Env,
  queue: NonNullable<ReturnType<typeof getWebhookQueue>>,
  event: WebhookEvent,
  subscriptions: WebhookSubscription[],
): Promise<void> {
  const startedAt = Date.now();
  const now = new Date().toISOString();

  const existingRecords = await Promise.all(
    subscriptions.map((sub) => getDeliveryRecord(env, event.id, sub.id)),
  );

  const deliveries = subscriptions
    .map((sub, index) => ({ sub, record: existingRecords[index] }))
    .filter(({ record }) => record?.status !== "delivered");

  if (deliveries.length === 0) {
    logger.info("All webhook deliveries already completed; skipping enqueue", {
      component: "webhook",
      event_id: event.id,
      subscriptions: subscriptions.length,
    });
    return;
  }

  await Promise.all(
    deliveries.map(({ sub, record }) =>
      persistDeliveryRecord(env, {
        event_id: event.id,
        subscription_id: sub.id,
        status: "pending",
        attempts: record?.attempts ?? [],
        created_at: now,
      }),
    ),
  );

  const messages: { body: WebhookQueueMessage }[] = deliveries.map(
    ({ sub }) => ({
      body: {
        deliveryId: webhookDeliveryId(event.id, sub.id),
        event,
        subscriptionId: sub.id,
        enqueuedAt: now,
      },
    }),
  );

  await queue.sendBatch(messages);

  await recordWebhookMetric(
    env,
    WEBHOOK_METRICS.ENQUEUE_TOTAL,
    messages.length,
    { event_type: event.type },
  );
  await recordWebhookMetric(
    env,
    WEBHOOK_METRICS.ENQUEUE_LATENCY_MS,
    Date.now() - startedAt,
    { event_type: event.type },
    { type: "histogram", durationMs: Date.now() - startedAt },
  );

  logger.info(`Enqueued ${messages.length} outgoing webhook deliveries`, {
    component: "webhook",
    event_id: event.id,
    event_type: event.type,
    enqueued: messages.length,
    enqueue_latency_ms: Date.now() - startedAt,
  });
}

/**
 * Loads every active subscription once. Callers fanning out several events
 * should reuse the result instead of reloading per event.
 */
export async function getActiveWebhookSubscriptions(
  env: Env,
): Promise<WebhookSubscription[]> {
  try {
    const kv = getWebhookKV(env);
    if (!kv) return [];

    // List all subscription keys
    const listResult = await listAllKvKeys(kv, {
      prefix: "webhook_subscription:",
    });

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
    logger.error("Failed to get active webhook subscriptions", {
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

/**
 * Inline delivery path used when no durable queue is bound. Performs bounded
 * attempts with exponential backoff and records the terminal outcome.
 */
async function sendWebhookToSubscription(
  env: Env,
  event: WebhookEvent,
  subscription: WebhookSubscription,
): Promise<void> {
  const startedAt = Date.now();
  const retryPolicy = subscription.retry_policy || DEFAULT_RETRY_POLICY;

  const delivery: WebhookDelivery = {
    event_id: event.id,
    subscription_id: subscription.id,
    status: "pending",
    attempts: [],
    created_at: new Date().toISOString(),
  };

  for (let attempt = 1; attempt <= retryPolicy.max_attempts; attempt++) {
    const result = await deliverWebhookAttempt(env, event, subscription);
    delivery.attempts.push(result.attempt);

    if (result.status === "delivered") {
      delivery.status = "delivered";
      delivery.delivered_at = result.attempt.timestamp;

      logger.info(`Webhook delivered: ${event.id} to ${subscription.url}`, {
        component: "webhook",
        event_id: event.id,
        subscription_id: subscription.id,
        attempts: attempt,
      });

      break;
    }

    const canRetry =
      attempt < retryPolicy.max_attempts && result.status !== "permanent";
    delivery.status = canRetry ? "retrying" : "failed";

    if (canRetry) {
      await recordWebhookMetric(env, WEBHOOK_METRICS.RETRY_TOTAL, 1, {
        event_type: event.type,
      });
      const delay = calculateBackoff(attempt, retryPolicy);
      await sleep(delay);
    } else {
      break;
    }
  }

  await persistDeliveryRecord(env, delivery);

  const elapsed = Date.now() - startedAt;
  await recordWebhookMetric(env, WEBHOOK_METRICS.DELIVERY_TOTAL, 1, {
    event_type: event.type,
    status: delivery.status,
  });
  await recordWebhookMetric(
    env,
    WEBHOOK_METRICS.DELIVERY_LATENCY_MS,
    elapsed,
    { event_type: event.type, status: delivery.status },
    { type: "histogram", durationMs: elapsed },
  );

  // If failed after all retries, add to dead letter queue
  if (delivery.status === "failed") {
    await addToDeadLetterQueue(env, delivery, event);
  }
}
