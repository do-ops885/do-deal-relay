import type { Env } from "../../types";
import type { Deal } from "../../types/deal";
import {
  getActiveSubscriptionsByFrequency,
  type AlertFrequency,
  type AlertSubscriptionRow,
} from "../d1/alert-subscriptions";
import {
  sendAlertNotification,
  type AlertNotificationResult,
} from "./notifier";
import { createComplianceLogger } from "../eu-ai-act-logger";
import { logger } from "../global-logger";

export interface MatcherRunSummary {
  subscriptionsProcessed: number;
  notificationsSent: number;
  results: AlertNotificationResult[];
}

// ============================================================================
// FTS5-parity token semantics (IMP-4, ADR-031 hardening)
// ============================================================================

/**
 * Tokenize free text the way the D1 FTS5 unicode61 tokenizer would: split on
 * non-alphanumeric boundaries, lowercase, drop empties. Kept in sync with the
 * referrals_fts indexing path so the in-memory matcher and the FTS5 search
 * path agree on what a "token" is.
 */
export function tokenizeDealText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * FTS5 MATCH parity for a single query token against deal tokens:
 * - `token`  — exact-token match (no substring: "art" does not hit "startup")
 * - `token*` — prefix match against any deal token (explicit FTS5 prefix)
 *
 * Query-side substring matching was deliberately dropped: it produced false
 * positives (e.g. "car" matching "cardano") and diverged from the FTS5
 * search path. Callers wanting stems write `car*`.
 */
function matchesQueryToken(
  dealTokens: Set<string>,
  queryToken: string,
): boolean {
  if (queryToken.endsWith("*")) {
    const prefix = queryToken.slice(0, -1);
    if (prefix.length < 2) return false;
    for (const token of dealTokens) {
      if (token.startsWith(prefix)) return true;
    }
    return false;
  }
  return dealTokens.has(queryToken);
}

/**
 * Split a raw query into matchable tokens, preserving a trailing `*` prefix
 * operator per whitespace-delimited word (the FTS5 prefix syntax).
 */
function tokenizeQuery(normalizedQuery: string): string[] {
  return normalizedQuery
    .split(/\s+/)
    .map((word) => {
      const hasPrefix = word.endsWith("*");
      const core = word.replace(/[^\w]/g, "");
      return hasPrefix && core.length > 0 ? `${core}*` : core;
    })
    .filter((t) => (t.endsWith("*") ? t.length > 2 : t.length > 1));
}

/**
 * Score a single deal against a query string using FTS5-parity token
 * matching (exact/prefix tokens) with phrase and domain/category boosts.
 * Returns a score between 0.0 and 1.0.
 */
export function scoreDealAgainstQuery(deal: Deal, queryStr: string): number {
  if (!queryStr || !queryStr.trim()) return 0;

  const normalizedQuery = queryStr.toLowerCase().trim();
  const queryTokens = tokenizeQuery(normalizedQuery);

  if (queryTokens.length === 0) return 0;

  const dealTitle = (deal.title || "").toLowerCase();
  const dealDescription = (deal.description || "").toLowerCase();
  const dealCode = (deal.code || "").toLowerCase();
  const dealDomain = (deal.source?.domain || "").toLowerCase();
  const dealCategories = Array.isArray(deal.metadata?.category)
    ? (deal.metadata.category as string[]).map((c) => c.toLowerCase()).join(" ")
    : "";
  const dealTags = Array.isArray(deal.metadata?.tags)
    ? (deal.metadata.tags as string[]).map((t) => t.toLowerCase()).join(" ")
    : "";

  const combinedDealText = `${dealTitle} ${dealDescription} ${dealCode} ${dealDomain} ${dealCategories} ${dealTags}`;
  const dealTokens = new Set(tokenizeDealText(combinedDealText));

  // Phrase match bonus (FTS5 "..." semantics): multi-word queries appearing
  // verbatim. Single-token queries skip this on purpose — a lone token must
  // win on token semantics ("art" must not phrase-match "startups").
  if (
    normalizedQuery.includes(" ") &&
    combinedDealText.includes(normalizedQuery)
  ) {
    return 1.0;
  }

  // Token match ratio (FTS5 AND semantics map to ratio 1.0)
  let matchedTokens = 0;
  for (const token of queryTokens) {
    if (matchesQueryToken(dealTokens, token)) {
      matchedTokens++;
    }
  }

  const tokenRatio = matchedTokens / queryTokens.length;

  // Domain / Category direct hit boost
  const categoryOrDomainMatch = queryTokens.some(
    (t) =>
      dealDomain.includes(t.replace(/\*$/, "")) ||
      dealCategories.includes(t.replace(/\*$/, "")),
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
    subscriptions = await getActiveSubscriptionsByFrequency(
      env.DEALS_DB,
      frequency,
    );
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
          operation: "deal_alert_match",
          inputData: {
            source: "pipeline_published_deals",
            hash: sub.saved_query_id,
            description: `Matched query "${query}" against ${deals.length} deals`,
            metadata: {
              subscriptionId: sub.id,
              userId: sub.user_id,
              channel: sub.channel,
            },
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
