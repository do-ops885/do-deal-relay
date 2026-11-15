// ============================================================================
// Webhook Dead Letter Queue - Inspectable, replayable failed deliveries
// ============================================================================

import type { Env } from "../../types";
import type { WebhookEvent, WebhookDelivery, DeadLetterEvent } from "./types";
import { getWebhookKV } from "./types";
import { getSubscription } from "./subscriptions";
import { logger } from "../global-logger";
import { toError } from "../sanitize-error";
import { fetchInBatches } from "../utils";
import { listAllKvKeys } from "../kv-pagination";
import { deliverWebhookAttempt } from "./attempt";
import { getDeliveryRecord, persistDeliveryRecord } from "./records";
import {
  getWebhookQueue,
  webhookDeliveryId,
  type WebhookQueueMessage,
} from "./queue";
import { recordWebhookMetric, WEBHOOK_METRICS } from "./metrics";
import { DELIVERY_CONSTANTS } from "./attempt";

const DLQ_PREFIX = "webhook_dlq:";

function deadLetterKey(eventId: string, subscriptionId: string): string {
  return `${DLQ_PREFIX}${eventId}:${subscriptionId}`;
}

/**
 * Best-effort DLQ depth gauge; measurement must never fail a delivery path.
 */
async function recordDeadLetterDepth(env: Env): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;

  try {
    const remaining = await listAllKvKeys(kv, { prefix: DLQ_PREFIX });
    await recordWebhookMetric(
      env,
      WEBHOOK_METRICS.DLQ_DEPTH,
      remaining.keys.length,
      {},
      { type: "gauge" },
    );
  } catch (error) {
    logger.warn("Failed to measure webhook DLQ depth (non-critical)", {
      component: "webhook",
      error: toError(error).message,
    });
  }
}

export async function addToDeadLetterQueue(
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
    deadLetterKey(delivery.event_id, delivery.subscription_id),
    JSON.stringify(dlqEntry),
    { expirationTtl: DELIVERY_CONSTANTS.DLQ_EXPIRATION_SECONDS },
  );

  logger.warn(`Webhook added to DLQ: ${delivery.event_id}`, {
    component: "webhook",
    event_id: delivery.event_id,
    subscription_id: delivery.subscription_id,
    attempts: delivery.attempts.length,
  });

  await recordDeadLetterDepth(env);
}

/**
 * Remove a resolved DLQ entry and refresh the depth gauge.
 */
async function removeFromDeadLetterQueue(
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;

  await kv.delete(deadLetterKey(eventId, subscriptionId));
  await recordDeadLetterDepth(env);
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

    const listResult = await listAllKvKeys(kv, { prefix: DLQ_PREFIX });

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
 * Replays a failed delivery from the Dead Letter Queue.
 *
 * The entry is only removed once the replay is durably accepted: an
 * already-delivered identity is dropped without a second subscriber call, a
 * queue-bound deployment re-enqueues the original delivery ID, and inline
 * deployments perform one bounded attempt. A replay that is still failing
 * keeps the entry inspectable.
 *
 * @param env - Worker environment with KV bindings.
 * @param eventId - Unique ID of the failed event.
 * @param subscriptionId - ID of the subscription that failed.
 * @returns True when the delivery was accepted or is already delivered.
 */
export async function retryDeadLetterEvent(
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<boolean> {
  const kv = getWebhookKV(env);
  if (!kv) return false;

  const dlqEntry = await kv.get<DeadLetterEvent>(
    deadLetterKey(eventId, subscriptionId),
    "json",
  );
  if (!dlqEntry) return false;

  // Duplicate suppression: a delivered identity is never sent twice.
  const existing = await getDeliveryRecord(env, eventId, subscriptionId);
  if (existing?.status === "delivered") {
    await removeFromDeadLetterQueue(env, eventId, subscriptionId);
    return true;
  }

  const subscription = await getSubscription(env, subscriptionId);
  if (
    !subscription ||
    !subscription.active ||
    !subscription.events.includes(dlqEntry.event.type)
  ) {
    return false;
  }

  const queue = getWebhookQueue(env);
  if (queue) {
    const message: WebhookQueueMessage = {
      deliveryId: webhookDeliveryId(eventId, subscriptionId),
      event: dlqEntry.event,
      subscriptionId,
      enqueuedAt: new Date().toISOString(),
    };

    try {
      await queue.send(message);
    } catch (error) {
      logger.warn("Failed to re-enqueue webhook DLQ entry", {
        component: "webhook",
        event_id: eventId,
        subscription_id: subscriptionId,
        error: toError(error).message,
      });
      return false;
    }

    await recordWebhookMetric(env, WEBHOOK_METRICS.ENQUEUE_TOTAL, 1, {
      event_type: dlqEntry.event.type,
      source: "dlq_replay",
    });
    await removeFromDeadLetterQueue(env, eventId, subscriptionId);
    return true;
  }

  const result = await deliverWebhookAttempt(env, dlqEntry.event, subscription);
  const delivery: WebhookDelivery = {
    event_id: eventId,
    subscription_id: subscriptionId,
    status: result.status === "delivered" ? "delivered" : "failed",
    attempts: [...(dlqEntry.delivery.attempts ?? []), result.attempt],
    created_at: dlqEntry.delivery.created_at,
    ...(result.status === "delivered"
      ? { delivered_at: result.attempt.timestamp }
      : {}),
  };
  await persistDeliveryRecord(env, delivery);

  if (result.status === "delivered") {
    await removeFromDeadLetterQueue(env, eventId, subscriptionId);
    return true;
  }

  logger.warn("Webhook DLQ replay failed; entry retained", {
    component: "webhook",
    event_id: eventId,
    subscription_id: subscriptionId,
    reason: result.status,
  });
  return false;
}
