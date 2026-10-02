/**
 * Alert Delivery Queue (ADR-032)
 *
 * Moves instant alert fan-out off the publish-stage hot path. The matcher
 * enqueues one serializable message per (subscription x matched batch) when
 * the ALERT_QUEUE binding exists and falls back to the inline send otherwise.
 * The consumer checks the alert_deliveries ledger before sending (idempotent
 * redelivery guard), records successful deliveries via INSERT OR IGNORE
 * (concurrent-duplicate guard), and retries failures; exhausted deliveries
 * land in the dead-letter consumer which records terminal `failed` status.
 *
 * @module worker/lib/alerts/queue
 */

import type { AlertDispatchMessage, Env } from "../../types";
import type { Deal } from "../../types/deal";
import { sha256 } from "../crypto";
import { recordDelivery, hasDelivered } from "../d1/alert-deliveries";
import type {
  AlertChannel,
  AlertFrequency,
  AlertSubscriptionRow,
} from "../d1/alert-subscriptions";
import { logger } from "../global-logger";
import { sendAlertNotification } from "./notifier";
import type { AlertNotificationResult } from "./notifier";

/** Truncates the digest suffix; full PK stays well under D1 TEXT limits. */
const ALERT_ID_HASH_LENGTH = 16;

/**
 * Deterministic alert id for one subscription and deal batch: stable across
 * redeliveries so the alert_deliveries primary key dedupes replays.
 * @param subscriptionId Subscription row id
 * @param deals Matched deals
 * @returns Stable id string unique per (subscription, deal set)
 */
export async function computeAlertId(
  subscriptionId: string,
  deals: Deal[],
): Promise<string> {
  const ids = deals
    .map((d) => d.id)
    .sort()
    .join(",");
  const digest = await sha256(`${subscriptionId}:${ids}`);
  return `alert_${subscriptionId}_${digest.slice(0, ALERT_ID_HASH_LENGTH)}`;
}

/**
 * Serialize a subscription + matched batch into a queue message.
 * @param subscription Subscription row
 * @param deals Matched deals
 * @param frequency Match frequency ("instant" | "daily-digest")
 * @returns Serializable dispatch message
 */
export async function buildAlertDispatchMessage(
  subscription: AlertSubscriptionRow,
  deals: Deal[],
  frequency: AlertFrequency,
): Promise<AlertDispatchMessage> {
  return {
    alertId: await computeAlertId(subscription.id, deals),
    subscriptionId: subscription.id,
    userId: subscription.user_id,
    savedQueryId: subscription.saved_query_id,
    channel: subscription.channel,
    destination: subscription.destination || null,
    query: subscription.query || "",
    threshold: subscription.threshold,
    frequency,
    deals,
  };
}

/**
 * Queue-first dispatch with inline fallback. Enqueues when the ALERT_QUEUE
 * binding exists; on enqueue failure falls back to the inline send so no
 * alert is dropped by a transient queue outage.
 * @param env Worker environment bindings
 * @param subscription Subscription row
 * @param deals Matched deals
 * @param frequency Match frequency
 * @returns Notification result (queued: true when enqueued)
 */
export async function dispatchAlertNotification(
  env: Env,
  subscription: AlertSubscriptionRow,
  deals: Deal[],
  frequency: AlertFrequency,
): Promise<AlertNotificationResult & { queued?: boolean }> {
  if (env.ALERT_QUEUE) {
    try {
      const message = await buildAlertDispatchMessage(
        subscription,
        deals,
        frequency,
      );
      await env.ALERT_QUEUE.send(message);
      return {
        subscriptionId: subscription.id,
        channel: subscription.channel,
        success: true,
        queued: true,
      };
    } catch (error) {
      logger.warn("Alert enqueue failed; falling back to inline send", {
        component: "alerts-queue",
        subscription_id: subscription.id,
        channel: subscription.channel,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return sendAlertNotification(env, subscription, deals);
}

/**
 * Type guard for serialized channel values (validated DB CHECK constraint on
 * the producing side; revalidated here because queue bodies cross a boundary).
 */
function isAlertChannel(value: string): value is AlertChannel {
  return (
    value === "telegram" ||
    value === "discord" ||
    value === "email" ||
    value === "webhook"
  );
}

function isAlertFrequency(value: string): value is AlertFrequency {
  return value === "instant" || value === "daily-digest";
}

/**
 * Reconstruct a subscription row from a dispatch message for the notifier.
 * Channel/frequency are passed as pre-validated arguments so no casts are
 * needed (guards run in consumeAlertMessage before this is called).
 */
function messageToSubscription(
  message: AlertDispatchMessage,
  channel: AlertChannel,
  frequency: AlertFrequency,
): AlertSubscriptionRow {
  return {
    id: message.subscriptionId,
    user_id: message.userId,
    saved_query_id: message.savedQueryId,
    channel,
    destination: message.destination || "",
    threshold: message.threshold,
    frequency,
    active: 1,
    created_at: 0,
    updated_at: 0,
    query: message.query,
  };
}

export interface AlertConsumeResult {
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
}

/**
 * Consume a single alert dispatch message: dedupe via the delivery ledger,
 * send via the notifier, record successful deliveries, retry failures.
 * Deterministically invalid messages are recorded as skipped and acked so
 * poison payloads cannot loop between the queue and the DLQ.
 */
async function consumeAlertMessage(
  env: Env,
  message: AlertDispatchMessage,
): Promise<"ack" | "retry"> {
  const { channel, frequency } = message;
  if (
    !message.alertId ||
    !message.subscriptionId ||
    !isAlertChannel(channel) ||
    !isAlertFrequency(frequency) ||
    !Array.isArray(message.deals)
  ) {
    logger.warn("Alert queue message failed validation; skipping", {
      component: "alerts-queue",
      subscription_id: message.subscriptionId,
      channel: message.channel,
      frequency: message.frequency,
    });
    await recordDelivery(env.DEALS_DB, {
      alertId: message.alertId || "invalid",
      subscriptionId: message.subscriptionId || "invalid",
      dealIds: [],
      channel: message.channel || "unknown",
      status: "skipped",
      error: "invalid message payload",
    });
    return "ack";
  }

  if (
    await hasDelivered(env.DEALS_DB, message.alertId, message.subscriptionId)
  ) {
    logger.info("Alert already delivered; acking duplicate", {
      component: "alerts-queue",
      subscription_id: message.subscriptionId,
      alert_id: message.alertId,
    });
    return "ack";
  }

  // Guards above narrowed channel/frequency to their union members.
  const subscription = messageToSubscription(message, channel, frequency);
  const deals = message.deals as Deal[];
  const result = await sendAlertNotification(env, subscription, deals);

  if (result.success) {
    // INSERT OR IGNORE: concurrent redelivery of the same alert collapses to
    // one ledger row instead of raising on the (alert_id, subscription_id) PK.
    await recordDelivery(env.DEALS_DB, {
      alertId: message.alertId,
      subscriptionId: message.subscriptionId,
      dealIds: deals.map((d) => d.id),
      channel: message.channel,
      status: "sent",
    });
    return "ack";
  }

  // No ledger row on failure so queue retries actually resend; terminal
  // failures are recorded by the dead-letter consumer after max_retries.
  logger.warn("Alert delivery failed; retrying via queue", {
    component: "alerts-queue",
    subscription_id: message.subscriptionId,
    alert_id: message.alertId,
    error: result.error,
  });
  return "retry";
}

/**
 * Queue consumer for the `deal-alerts` queue. Acks sent/skipped messages and
 * retries failed ones; Cloudflare moves exhausted messages to the DLQ.
 */
export async function processAlertQueueBatch(
  batch: MessageBatch<AlertDispatchMessage>,
  env: Env,
): Promise<AlertConsumeResult> {
  const summary: AlertConsumeResult = {
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
  };

  for (const message of batch.messages) {
    let disposition: "ack" | "retry";
    try {
      disposition = await consumeAlertMessage(env, message.body);
    } catch (error) {
      logger.error("Alert queue consumer error; retrying message", {
        component: "alerts-queue",
        error: error instanceof Error ? error.message : String(error),
      });
      disposition = "retry";
    }

    try {
      if (disposition === "ack") {
        message.ack();
        summary.sent += 1;
      } else {
        message.retry();
        summary.retried += 1;
      }
    } catch (ackError) {
      summary.failed += 1;
      logger.warn("Alert queue ack/retry failed", {
        component: "alerts-queue",
        error: ackError instanceof Error ? ackError.message : String(ackError),
      });
    }
  }

  return summary;
}

/**
 * Dead-letter consumer for `deal-alerts-dlq`: records terminal `failed`
 * status in the ledger and acks. max_retries is 0 so nothing loops onward.
 */
export async function processAlertDLQBatch(
  batch: MessageBatch<AlertDispatchMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    try {
      const alreadyRecorded = await hasDelivered(
        env.DEALS_DB,
        body?.alertId || "invalid",
        body?.subscriptionId || "invalid",
      );
      if (!alreadyRecorded) {
        await recordDelivery(env.DEALS_DB, {
          alertId: body?.alertId || "invalid",
          subscriptionId: body?.subscriptionId || "invalid",
          dealIds: [],
          channel: body?.channel || "unknown",
          status: "failed",
          error: "delivery exhausted retries (dead letter)",
        });
      }
    } catch (error) {
      logger.error("Alert DLQ recording failed", {
        component: "alerts-queue",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      message.ack();
    } catch (ackError) {
      logger.warn("Alert DLQ ack failed", {
        component: "alerts-queue",
        error: ackError instanceof Error ? ackError.message : String(ackError),
      });
    }
  }
}
