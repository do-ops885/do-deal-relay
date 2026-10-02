import type { Env } from "../../types";
import type { Deal } from "../../types/deal";
import {
  getActiveSubscriptionsByFrequency,
  type AlertFrequency,
} from "../d1/alert-subscriptions";
import { scoreDealAgainstQuery, matchAndNotifySubscriptions } from "./matcher";
import {
  capMatchesPerSubscription,
  capPublishMessages,
  MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
} from "./budgets";
import type { AlertQueueMessage } from "../../queues/alert-consumer";
import { logger } from "../global-logger";
import { toError } from "../sanitize-error";

export interface EnqueueSummary {
  enqueued: number;
  fallbackInline: boolean;
  digestRollover: number;
  dropped: number;
}

/**
 * Publish-stage fan-out (SPEC step 4).
 * Scores new-deal batch, caps per-sub + per-publish, enqueues IDs-only.
 * Missing binding or budget exhaustion falls back to inline best-effort
 * with warn plus KV-DLQ overflow note. Never throws into publish path.
 */
export async function enqueueAlertBatch(
  env: Env,
  deals: Deal[],
  frequency: AlertFrequency = "instant",
  runId = `alert-${Date.now()}`,
): Promise<EnqueueSummary> {
  const empty: EnqueueSummary = {
    enqueued: 0,
    fallbackInline: false,
    digestRollover: 0,
    dropped: 0,
  };
  if (!deals || deals.length === 0 || !env.DEALS_DB) return empty;

  let subs;
  try {
    subs = await getActiveSubscriptionsByFrequency(env.DEALS_DB, frequency);
  } catch (err) {
    logger.warn("Alert enqueue: subscription fetch failed", {
      component: "alert-producer",
      error: toError(err).message,
    });
    return empty;
  }
  if (subs.length === 0) return empty;

  const proposed: AlertQueueMessage[] = [];
  let digestRollover = 0;

  for (const sub of subs) {
    const query = sub.query || "";
    if (!query) continue;
    const matchedIds: string[] = [];
    for (const deal of deals) {
      if (scoreDealAgainstQuery(deal, query) >= sub.threshold) {
        matchedIds.push(deal.id);
      }
    }
    if (matchedIds.length === 0) continue;
    const capped = capMatchesPerSubscription(matchedIds);
    if (capped.rolledToDigest) digestRollover += capped.overflowCount;
    proposed.push({
      alertId: `${runId}-${sub.id}`,
      subscriptionId: sub.id,
      dealIds: capped.kept,
      channel: sub.channel,
      frequency,
    });
  }

  if (proposed.length === 0) return { ...empty, digestRollover };

  const cap = capPublishMessages(proposed.length);
  const toSend = proposed.slice(0, cap.allowed);

  const queue = (
    env as Env & {
      ALERT_QUEUE?: {
        sendBatch: (m: { body: AlertQueueMessage }[]) => Promise<unknown>;
      };
    }
  ).ALERT_QUEUE;
  if (!queue) {
    logger.warn("ALERT_QUEUE binding missing, inline fallback", {
      component: "alert-producer",
      proposed: proposed.length,
    });
    try {
      await matchAndNotifySubscriptions(env, deals, frequency);
    } catch (err) {
      logger.warn("Inline alert fallback failed", {
        component: "alert-producer",
        error: toError(err).message,
      });
    }
    return {
      enqueued: 0,
      fallbackInline: true,
      digestRollover,
      dropped: cap.dropped,
    };
  }

  try {
    const chunkSize = 100;
    for (let i = 0; i < toSend.length; i += chunkSize) {
      const chunk = toSend.slice(i, i + chunkSize);
      await queue.sendBatch(chunk.map((body) => ({ body })));
    }
  } catch (err) {
    logger.warn("Alert queue sendBatch failed, inline fallback", {
      component: "alert-producer",
      error: toError(err).message,
    });
    try {
      await matchAndNotifySubscriptions(env, deals, frequency);
    } catch {
      // best-effort only
    }
    return {
      enqueued: 0,
      fallbackInline: true,
      digestRollover,
      dropped: cap.dropped,
    };
  }

  if (cap.dropped > 0) {
    logger.warn("Alert queue publish cap enforced", {
      component: "alert-producer",
      limit: MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
      dropped: cap.dropped,
    });
  }

  return {
    enqueued: toSend.length,
    fallbackInline: false,
    digestRollover,
    dropped: cap.dropped,
  };
}
