// ============================================================================
// Outgoing Webhook Queue Consumer
// ----------------------------------------------------------------------------
// Per-message delivery with queue retry/DLQ semantics. The producer persists a
// pending delivery record and enqueues the full event payload, so delivery
// survives request termination and redelivery is idempotent by delivery ID.
// ============================================================================

import type { MessageBatch } from "@cloudflare/workers-types";
import type { Env } from "../types";
import type { WebhookQueueMessage } from "../lib/webhook/queue";
import type { WebhookDelivery } from "../lib/webhook/types";
import { DEFAULT_RETRY_POLICY } from "../lib/webhook/types";
import { getSubscription } from "../lib/webhook/subscriptions";
import { deliverWebhookAttempt } from "../lib/webhook/attempt";
import {
  getDeliveryRecord,
  persistDeliveryRecord,
} from "../lib/webhook/records";
import { addToDeadLetterQueue } from "../lib/webhook/dlq";
import { recordWebhookMetric, WEBHOOK_METRICS } from "../lib/webhook/metrics";
import { logger } from "../lib/global-logger";
import { toError } from "../lib/sanitize-error";

function isValidMessage(
  body: WebhookQueueMessage | undefined,
): body is WebhookQueueMessage {
  return Boolean(
    body &&
    body.event &&
    typeof body.event.id === "string" &&
    typeof body.subscriptionId === "string",
  );
}

/**
 * Process one queue delivery per message. Success or exhaustion is acked;
 * transient failures retry within the queue's bounded retry budget.
 */
export async function handleWebhookQueueBatch(
  batch: MessageBatch<WebhookQueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const body = msg.body;
    if (!isValidMessage(body)) {
      msg.ack();
      continue;
    }

    const startedAt = Date.now();

    try {
      const existing = await getDeliveryRecord(
        env,
        body.event.id,
        body.subscriptionId,
      );

      // Duplicate suppression: a successful delivery is never re-sent.
      if (existing?.status === "delivered") {
        msg.ack();
        continue;
      }

      const subscription = await getSubscription(env, body.subscriptionId);
      if (
        !subscription ||
        !subscription.active ||
        !subscription.events.includes(body.event.type)
      ) {
        msg.ack();
        continue;
      }

      const policy = subscription.retry_policy || DEFAULT_RETRY_POLICY;
      const result = await deliverWebhookAttempt(env, body.event, subscription);
      const attemptCount = msg.attempts ?? 1;

      const delivery: WebhookDelivery = {
        event_id: body.event.id,
        subscription_id: body.subscriptionId,
        status: result.status === "delivered" ? "delivered" : "retrying",
        attempts: [...(existing?.attempts ?? []), result.attempt],
        created_at: existing?.created_at ?? body.enqueuedAt,
      };
      if (result.status === "delivered") {
        delivery.delivered_at = result.attempt.timestamp;
      }

      const elapsed = Date.now() - startedAt;

      if (result.status === "delivered") {
        await persistDeliveryRecord(env, delivery);
        await recordWebhookMetric(env, WEBHOOK_METRICS.DELIVERY_TOTAL, 1, {
          event_type: body.event.type,
          status: "delivered",
        });
        await recordWebhookMetric(
          env,
          WEBHOOK_METRICS.DELIVERY_LATENCY_MS,
          elapsed,
          { event_type: body.event.type },
          { type: "histogram", durationMs: elapsed },
        );
        logger.info(`Queued webhook delivered: ${body.deliveryId}`, {
          component: "webhook",
          event_id: body.event.id,
          subscription_id: body.subscriptionId,
          attempts: attemptCount,
          delivery_latency_ms: elapsed,
        });
        msg.ack();
        continue;
      }

      const exhausted =
        result.status === "permanent" || attemptCount >= policy.max_attempts;

      if (exhausted) {
        delivery.status = "failed";
        await persistDeliveryRecord(env, delivery);
        await addToDeadLetterQueue(env, delivery, body.event);
        await recordWebhookMetric(env, WEBHOOK_METRICS.DELIVERY_TOTAL, 1, {
          event_type: body.event.type,
          status: result.status === "permanent" ? "permanent" : "failed",
        });
        await recordWebhookMetric(
          env,
          WEBHOOK_METRICS.DELIVERY_LATENCY_MS,
          elapsed,
          { event_type: body.event.type, status: delivery.status },
          { type: "histogram", durationMs: elapsed },
        );
        logger.warn(`Queued webhook failed permanently: ${body.deliveryId}`, {
          component: "webhook",
          event_id: body.event.id,
          subscription_id: body.subscriptionId,
          attempts: attemptCount,
          reason: result.status,
        });
        msg.ack();
        continue;
      }

      await persistDeliveryRecord(env, delivery);
      await recordWebhookMetric(env, WEBHOOK_METRICS.RETRY_TOTAL, 1, {
        event_type: body.event.type,
      });
      logger.warn(
        `Queued webhook attempt failed, retrying: ${body.deliveryId}`,
        {
          component: "webhook",
          event_id: body.event.id,
          subscription_id: body.subscriptionId,
          attempt: attemptCount,
          max_attempts: policy.max_attempts,
        },
      );
      msg.retry();
    } catch (error) {
      logger.warn("Webhook queue message failed, scheduled retry", {
        component: "webhook-consumer",
        error: toError(error).message,
        delivery_id: body.deliveryId,
      });
      msg.retry();
    }
  }
}
