import type { MessageBatch } from "@cloudflare/workers-types";
import type { Env } from "../types";
import { recordDelivery, hasSentDelivery } from "../lib/d1/alert-deliveries";
import { sendAlertNotification } from "../lib/alerts/notifier";
import { getSubscriptionById } from "../lib/d1/alert-subscriptions";
import { getProductionSnapshot } from "../lib/storage";
import { createComplianceLogger } from "../lib/eu-ai-act-logger";
import { logger } from "../lib/global-logger";
import { toError } from "../lib/sanitize-error";
import type { Deal } from "../types/deal";

export interface AlertQueueMessage {
  alertId: string;
  subscriptionId: string;
  dealIds: string[];
  channel: string;
  frequency: "instant" | "daily-digest";
  runDate?: string;
}

/**
 * Idempotent queue consumer (SPEC step 4, ADR-031).
 * - Skips only when a prior attempt already succeeded (`hasSentDelivery`),
 *   so failed attempts are retried instead of being swallowed.
 * - Delivery status is recorded after the send, never before: recording
 *   first would make a redelivery look like a duplicate and ack a message
 *   that was never delivered.
 * - Payload is IDs only; deals resolved from the production snapshot.
 * - Per-message ack/retry; batch-level isolation via explicit ack.
 */
export async function handleAlertQueueBatch(
  batch: MessageBatch<AlertQueueMessage>,
  env: Env,
): Promise<void> {
  if (!env.DEALS_DB) {
    batch.retryAll();
    return;
  }

  for (const msg of batch.messages) {
    const body = msg.body;
    if (!body || !body.alertId || !body.subscriptionId) {
      msg.ack();
      continue;
    }

    try {
      if (
        await hasSentDelivery(env.DEALS_DB, body.alertId, body.subscriptionId)
      ) {
        msg.ack();
        continue;
      }

      const sub = await getSubscriptionById(env.DEALS_DB, body.subscriptionId);
      if (!sub) {
        msg.ack();
        continue;
      }

      const snapshot = await getProductionSnapshot(env);
      const byId = new Map<string, Deal>();
      if (snapshot) {
        for (const d of snapshot.deals) byId.set(d.id, d);
      }
      const deals = (body.dealIds || [])
        .map((id) => byId.get(id))
        .filter((d): d is Deal => d !== undefined);

      if (deals.length === 0) {
        await recordDelivery(env.DEALS_DB, {
          alertId: body.alertId,
          subscriptionId: body.subscriptionId,
          dealIds: body.dealIds || [],
          channel: body.channel || "webhook",
          status: "skipped",
        });
        msg.ack();
        continue;
      }

      const result = await sendAlertNotification(env, sub, deals);
      await recordDelivery(env.DEALS_DB, {
        alertId: body.alertId,
        subscriptionId: body.subscriptionId,
        dealIds: body.dealIds || [],
        channel: body.channel || sub.channel,
        status: result.success ? "sent" : "failed",
        ...(result.error !== undefined ? { error: result.error } : {}),
      });
      await logAlertMatch(env, sub, deals, result.success);

      if (result.success) {
        msg.ack();
      } else {
        msg.retry();
      }
    } catch (err) {
      logger.warn("Alert queue message failed, scheduled retry", {
        component: "alert-consumer",
        error: toError(err).message,
      });
      msg.retry();
    }
  }
}

/**
 * EU AI Act Article 12 record for the queued delivery path. The inline
 * matcher logs the same operation, so queue and inline fan-out stay
 * auditable at the same depth. Never fails the delivery.
 */
async function logAlertMatch(
  env: Env,
  sub: {
    id: string;
    user_id: string;
    channel: string;
    saved_query_id: string;
    query?: string;
  },
  deals: Deal[],
  success: boolean,
): Promise<void> {
  if (!env.DEALS_DB) return;
  try {
    const complianceLogger = createComplianceLogger(env.DEALS_DB);
    await complianceLogger.logOperation({
      timestamp: new Date().toISOString(),
      operationId: `alert_queue_${sub.id}_${Date.now()}`,
      operation: "deal_alert_match",
      inputData: {
        source: "pipeline_published_deals",
        hash: sub.saved_query_id,
        description: `Matched query "${sub.query || ""}" against ${deals.length} deals`,
        metadata: {
          subscriptionId: sub.id,
          userId: sub.user_id,
          channel: sub.channel,
        },
      },
      outputData: {
        result: success ? "notified" : "failed",
        confidence: 1.0,
        explanation: `Matched ${deals.length} deals via queue consumer`,
      },
    });
  } catch (err) {
    logger.warn("EU AI Act logging failed for queued alert (non-critical)", {
      component: "alert-consumer",
      error: toError(err).message,
    });
  }
}
