import type { Env } from "../../types";
import type { Deal } from "../../types/deal";
import {
  getActiveSubscriptionsByFrequency,
  type AlertFrequency,
  type AlertSubscriptionRow,
} from "../d1/alert-subscriptions";
import { sendAlertNotification, type AlertNotificationResult } from "./notifier";
import { createComplianceLogger } from "../eu-ai-act-logger";
import { logger } from "../global-logger";

export interface MatcherRunSummary {
  subscriptionsProcessed: number;
  notificationsSent: number;
  results: AlertNotificationResult[];
}

/**
 * Score a single deal against a query string using hybrid keyword + token matching.
 * Returns a score between 0.0 and 1.0.
 */
export function scoreDealAgainstQuery(deal: Deal, queryStr: string): number {
  if (!queryStr || !queryStr.trim()) return 0;

  const normalizedQuery = queryStr.toLowerCase().trim();
  const queryTokens = normalizedQuery
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (queryTokens.length === 0) return 0;

  const dealTitle = (deal.title || "").toLowerCase();
  const dealDescription = (deal.description || "").toLowerCase();
  const dealCode = (deal.code || "").toLowerCase();
  const dealDomain = (deal.source?.domain || "").toLowerCase();
  const dealCategories = (deal.category || []).map((c) => c.toLowerCase()).join(" ");
  const dealTags = (deal.tags || []).map((t) => t.toLowerCase()).join(" ");

  const combinedDealText = `${dealTitle} ${dealDescription} ${dealCode} ${dealDomain} ${dealCategories} ${dealTags}`;

  // Direct substring match bonus
  if (combinedDealText.includes(normalizedQuery)) {
    return 1.0;
  }

  // Token match ratio
  let matchedTokens = 0;
  for (const token of queryTokens) {
    if (combinedDealText.includes(token)) {
      matchedTokens++;
    }
  }

  const tokenRatio = matchedTokens / queryTokens.length;

  // Domain / Category direct hit boost
  const categoryOrDomainMatch = queryTokens.some(
    (t) => dealDomain.includes(t) || dealCategories.includes(t),
  );
  if (categoryOrDomainMatch && tokenRatio > 0.3) {
    return Math.min(1.0, tokenRatio + 0.3);
  }

  return tokenRatio;
}

/**
 * Match a batch of new deals against all active alert subscriptions of a given frequency
 * and send notifications for matches exceeding each subscription's threshold.
 */
export async function matchAndNotifySubscriptions(
  env: Env,
  deals: Deal[],
  frequency: AlertFrequency = "instant",
): Promise<MatcherRunSummary> {
  if (!deals || deals.length === 0 || !env.DEALS_DB) {
    return { subscriptionsProcessed: 0, notificationsSent: 0, results: [] };
  }

  let subscriptions: AlertSubscriptionRow[] = [];
  try {
    subscriptions = await getActiveSubscriptionsByFrequency(env.DEALS_DB, frequency);
  } catch (err) {
    logger.warn("Failed to fetch active alert subscriptions", {
      component: "alerts-matcher",
      error: err instanceof Error ? err.message : String(err),
    });
    return { subscriptionsProcessed: 0, notificationsSent: 0, results: [] };
  }

  if (subscriptions.length === 0) {
    return { subscriptionsProcessed: 0, notificationsSent: 0, results: [] };
  }

  const results: AlertNotificationResult[] = [];
  let notificationsSent = 0;
  const complianceLogger = createComplianceLogger(env.DEALS_DB);

  for (const sub of subscriptions) {
    const query = sub.query || "";
    if (!query) continue;

    const matchedDeals: Deal[] = [];
    for (const deal of deals) {
      const score = scoreDealAgainstQuery(deal, query);
      if (score >= sub.threshold) {
        matchedDeals.push(deal);
      }
    }

    if (matchedDeals.length > 0) {
      const notifyResult = await sendAlertNotification(env, sub, matchedDeals);
      results.push(notifyResult);
      if (notifyResult.success) {
        notificationsSent++;
      }

      // EU AI Act compliance logging (Article 12)
      try {
        await complianceLogger.logOperation({
          timestamp: new Date().toISOString(),
          operationId: `alert_match_${sub.id}_${Date.now()}`,
          operation: "personalized_deal_alert_match",
          inputData: {
            source: "pipeline_published_deals",
            hash: sub.saved_query_id,
            description: `Matched query "${query}" against ${deals.length} deals`,
            metadata: { subscriptionId: sub.id, userId: sub.user_id, channel: sub.channel },
          },
          outputData: {
            result: notifyResult.success ? "notified" : "failed",
            confidence: 1.0,
            explanation: `Matched ${matchedDeals.length} deals above threshold ${sub.threshold}`,
          },
        });
      } catch (logErr) {
        logger.warn("EU AI Act logging failed for alert match (non-critical)", {
          component: "alerts-matcher",
          error: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }
    }
  }

  return {
    subscriptionsProcessed: subscriptions.length,
    notificationsSent,
    results,
  };
}
