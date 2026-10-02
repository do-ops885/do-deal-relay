import type { MessageBatch } from "@cloudflare/workers-types";
import type { Env } from "../types";
import { recordDelivery } from "../lib/d1/alert-deliveries";
import { sendAlertNotification } from "../lib/alerts/notifier";
import { getSubscriptionById } from "../lib/d1/alert-subscriptions";
import { getProductionSnapshot } from "../lib/storage";
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
 * - INSERT OR IGNORE guard: duplicates acked without resend.
 * - Payload is IDs only; deals resolved from production snapshot.
 * - Success acks, failure retries (DLQ after max_retries via config).
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
      const first = await recordDelivery(env.DEALS_DB, {
        alertId: body.alertId,
        subscriptionId: body.subscriptionId,
        dealIds: body.dealIds || [],
        channel: body.channel || "webhook",
        status: "sent",
      });
      if (!first) {
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
        msg.ack();
        continue;
      }

      const result = await sendAlertNotification(env, sub, deals);
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
