import type { Env } from "../../types";
import type { Deal } from "../../types/deal";
import {
  getActiveSubscriptionsByFrequency,
  type AlertFrequency,
  type AlertSubscriptionRow,
} from "../d1/alert-subscriptions";
import {
  prepareDeal,
  scorePreparedDeal,
  matchAndNotifySubscriptions,
} from "./matcher";
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
  /**
   * Messages in a chunk whose sendBatch call failed. The queue may or may
   * not have accepted them, so they are never re-sent inline; stable
   * alertIds make a later queue redelivery idempotent.
   */
  ambiguous: number;
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
    ambiguous: 0,
  };
  if (!deals || deals.length === 0 || !env.DEALS_DB) return empty;

  let subs: AlertSubscriptionRow[];
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

  // Performance optimization: Pre-tokenize deals once O(N) before subscription matching loop.
  const preparedDeals = deals.map(prepareDeal);

  for (const sub of subs) {
    const query = sub.query || "";
    if (!query) continue;
    const matchedIds: string[] = [];
    for (const prepared of preparedDeals) {
      if (scorePreparedDeal(prepared, query) >= sub.threshold) {
        matchedIds.push(prepared.deal.id);
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
      ambiguous: 0,
    };
  }

  const chunkSize = 100;
  let acceptedCount = 0;
  let failedChunk: AlertQueueMessage[] | null = null;

  for (let i = 0; i < toSend.length; i += chunkSize) {
    const chunk = toSend.slice(i, i + chunkSize);
    try {
      await queue.sendBatch(chunk.map((body) => ({ body })));
      acceptedCount += chunk.length;
    } catch (err) {
      // Stop at the first failure. Earlier chunks are known-accepted and
      // must never be re-sent inline. Later chunks were never attempted and
      // are safe to deliver inline. The failing chunk is ambiguous.
      failedChunk = chunk;
      logger.warn("Alert queue sendBatch failed; isolating chunk", {
        component: "alert-producer",
        error: toError(err).message,
        accepted: acceptedCount,
        ambiguous: chunk.length,
      });
      break;
    }
  }

  let inlineAttempted = false;
  let ambiguous = 0;

  if (failedChunk !== null) {
    ambiguous = failedChunk.length;
    const failedStart = acceptedCount;
    const notEnqueued = toSend.slice(failedStart + failedChunk.length);
    const onlySubscriptionIds = new Set(
      notEnqueued.map((message) => message.subscriptionId),
    );
    if (onlySubscriptionIds.size > 0) {
      inlineAttempted = true;
      try {
        await matchAndNotifySubscriptions(env, deals, frequency, {
          onlySubscriptionIds,
        });
      } catch (inlineErr) {
        logger.warn("Inline alert recovery failed", {
          component: "alert-producer",
          error: toError(inlineErr).message,
        });
      }
    }
  }

  if (cap.dropped > 0) {
    logger.warn("Alert queue publish cap enforced", {
      component: "alert-producer",
      limit: MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
      dropped: cap.dropped,
    });
  }

  return {
    enqueued: acceptedCount,
    fallbackInline: inlineAttempted,
    digestRollover,
    dropped: cap.dropped,
    ambiguous,
  };
}
