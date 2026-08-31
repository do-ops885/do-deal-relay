import type { Deal, Env } from "../types";
import { CONFIG } from "../config";
import { logger } from "./global-logger";
import { notify } from "../notify";
import { sendOutgoingWebhooks } from "./webhook/delivery";
import { generateId } from "./webhook/types";
import { toError } from "./sanitize-error";

export function getNotificationThreshold(env: Env): number {
  const raw = env.NOTIFICATION_THRESHOLD;
  if (raw !== undefined && raw.trim() !== "") {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
    const fallback = Number.parseFloat(raw.trim());
    if (!Number.isNaN(fallback) && fallback >= 0) return fallback;
  }
  return CONFIG.HIGH_VALUE_THRESHOLD;
}

export function getRewardNumericValue(reward: Deal["reward"]): number | null {
  const value = reward.value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const sanitized = value.replace(/[^0-9.+-]/g, "");
    if (
      sanitized === "" ||
      sanitized === "." ||
      sanitized === "-" ||
      sanitized === "+"
    )
      return null;
    const parsed = Number.parseFloat(sanitized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function filterHighValueDeals(deals: Deal[], threshold: number): Deal[] {
  return deals.filter((deal) => {
    const numeric = getRewardNumericValue(deal.reward);
    return numeric !== null && numeric > threshold;
  });
}

export async function notifyHighValueDealsWithWebhook(
  env: Env,
  deals: Deal[],
  runId: string,
  traceId?: string,
): Promise<{
  threshold: number;
  highValueCount: number;
  notified: number;
  webhookSent: number;
}> {
  const threshold = getNotificationThreshold(env);
  const highValueDeals = filterHighValueDeals(deals, threshold);

  if (highValueDeals.length === 0) {
    logger.info("No high-value deals above threshold", {
      component: "high-value-notifier",
      threshold,
      deals_total: deals.length,
    });
    return {
      threshold,
      highValueCount: 0,
      notified: 0,
      webhookSent: 0,
    };
  }

  logger.info(
    `Found ${highValueDeals.length} high-value deals above ${threshold}`,
    {
      component: "high-value-notifier",
      threshold,
      high_value_count: highValueDeals.length,
    },
  );

  let notified = 0;
  let webhookSent = 0;

  for (const deal of highValueDeals) {
    const numeric = getRewardNumericValue(deal.reward) ?? 0;

    try {
      const sent = await notify(env, {
        type: "high_value_deal",
        severity: "info",
        run_id: runId,
        message: `High-value deal discovered: ${deal.code} (${deal.source.domain}) reward ${deal.reward.type} ${numeric} > threshold ${threshold}`,
        context: {
          code: deal.code,
          domain: deal.source.domain,
          reward_type: deal.reward.type,
          reward_value: numeric,
          threshold,
          deal_id: deal.id,
          url: deal.url,
          title: deal.title,
        },
      });
      if (sent) notified++;
    } catch (err) {
      logger.warn("Failed to send high-value push notification", {
        component: "high-value-notifier",
        deal_id: deal.id,
        error: toError(err).message,
      });
    }

    try {
      await sendOutgoingWebhooks(env, {
        id: `evt_${generateId()}`,
        type: "high_value_deal",
        timestamp: new Date().toISOString(),
        data: {
          id: deal.id,
          code: deal.code,
          url: deal.url,
          domain: deal.source.domain,
          title: deal.title,
          description: deal.description,
          reward: deal.reward,
          threshold,
          source: deal.source,
          trust_score: deal.source.trust_score,
        },
        metadata: {
          request_id: crypto.randomUUID(),
          trace_id: traceId ?? runId,
        },
      });
      webhookSent++;
    } catch (err) {
      logger.warn("Failed to send high-value webhook", {
        component: "high-value-notifier",
        deal_id: deal.id,
        error: toError(err).message,
      });
    }
  }

  return {
    threshold,
    highValueCount: highValueDeals.length,
    notified,
    webhookSent,
  };
}
