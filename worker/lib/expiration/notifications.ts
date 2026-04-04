import type { ExpiringDeal, Deal, Env } from "../../types";
import { notify } from "../../notify";
import { logger } from "../global-logger";
import { checkExpiringDeals } from "./finding";
import {
  getNotifiedExpiringDeals,
  recordNotifiedExpiringDeals,
} from "./scheduling";

// ============================================================================
// Send Notifications
// ============================================================================

export async function sendExpiryNotifications(
  env: Env,
  expiringDeals: ExpiringDeal[],
): Promise<void> {
  if (expiringDeals.length === 0) {
    return;
  }

  // Get already notified deals to avoid duplicates
  const alreadyNotified = await getNotifiedExpiringDeals(env);

  // Filter to only deals we haven't notified about recently
  const dealsToNotify = expiringDeals.filter(
    (ed) => !alreadyNotified.includes(ed.deal.id),
  );

  if (dealsToNotify.length === 0) {
    logger.info("All expiring deals already notified", {
      component: "expiration",
    });
    return;
  }

  // Group by notification window for better messaging
  const groupedByWindow = dealsToNotify.reduce(
    (acc, ed) => {
      const key = ed.notificationWindow;
      if (!acc[key]) acc[key] = [];
      acc[key].push(ed);
      return acc;
    },
    {} as Record<string, ExpiringDeal[]>,
  );

  // Send notifications for each window
  for (const [window, deals] of Object.entries(groupedByWindow)) {
    const dealList = deals
      .map(
        (ed) =>
          `- ${ed.deal.code} (${ed.deal.source.domain}): expires in ${ed.daysUntilExpiry} day${ed.daysUntilExpiry === 1 ? "" : "s"}`,
      )
      .join("\n");

    await notify(env, {
      type: "deal_expiring",
      severity: window === "7d" ? "warning" : "info",
      run_id: `expiry-check-${Date.now()}`,
      message: `${deals.length} deal${deals.length === 1 ? "" : "s"} expiring within ${window}:\n${dealList}`,
      context: {
        window,
        deals: deals.map((ed) => ({
          id: ed.deal.id,
          code: ed.deal.code,
          domain: ed.deal.source.domain,
          days_until_expiry: ed.daysUntilExpiry,
          expiry_date: ed.deal.expiry.date,
        })),
      },
    });
  }

  // Record notified deals
  const notifiedIds = dealsToNotify.map((ed) => ed.deal.id);
  await recordNotifiedExpiringDeals(env, notifiedIds);

  logger.info(`Sent expiry notifications for ${dealsToNotify.length} deals`, {
    component: "expiration",
    count: dealsToNotify.length,
  });
}

export async function notifyExpiringDeals(env: Env): Promise<{
  notified: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const counts = {
    notified: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  try {
    const { deals, byUrgency } = await checkExpiringDeals(env, 30);

    if (deals.length === 0) {
      return { ...counts, errors };
    }

    // Get already notified deals
    const alreadyNotified = await getNotifiedExpiringDeals(env);
    const dealsToNotify = deals.filter(
      (ed) => !alreadyNotified.includes(ed.deal.id),
    );

    if (dealsToNotify.length === 0) {
      logger.info("All expiring deals already notified", {
        component: "expiration",
      });
      return { ...counts, errors };
    }

    // Group by urgency
    const byUrgencyLevel: Record<string, ExpiringDeal[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const deal of dealsToNotify) {
      if (deal.daysUntilExpiry <= 3) {
        byUrgencyLevel.critical.push(deal);
        counts.critical++;
      } else if (deal.daysUntilExpiry <= 7) {
        byUrgencyLevel.high.push(deal);
        counts.high++;
      } else if (deal.daysUntilExpiry <= 14) {
        byUrgencyLevel.medium.push(deal);
        counts.medium++;
      } else {
        byUrgencyLevel.low.push(deal);
        counts.low++;
      }
    }

    // Send notifications for each urgency level
    for (const [urgency, urgencyDeals] of Object.entries(byUrgencyLevel)) {
      if (urgencyDeals.length === 0) continue;

      const severity =
        urgency === "critical"
          ? "critical"
          : urgency === "high"
            ? "warning"
            : "info";

      const dealList = urgencyDeals
        .map(
          (ed) =>
            `- ${ed.deal.code} (${ed.deal.source.domain}): ${ed.daysUntilExpiry} day${ed.daysUntilExpiry === 1 ? "" : "s"} left`,
        )
        .join("\n");

      await notify(env, {
        type: "deal_expiring",
        severity,
        run_id: `expiry-notify-${Date.now()}`,
        message: `${urgency.toUpperCase()}: ${urgencyDeals.length} deal${urgencyDeals.length === 1 ? "" : "s"} expiring soon:\n${dealList}`,
        context: {
          urgency,
          deal_count: urgencyDeals.length,
          deals: urgencyDeals.map((ed) => ({
            id: ed.deal.id,
            code: ed.deal.code,
            domain: ed.deal.source.domain,
            days_until_expiry: ed.daysUntilExpiry,
            expiry_date: ed.deal.expiry.date,
          })),
        },
      });

      counts.notified += urgencyDeals.length;
    }

    // Record notified deals
    const notifiedIds = dealsToNotify.map((ed) => ed.deal.id);
    await recordNotifiedExpiringDeals(env, notifiedIds);

    logger.info(`Sent expiry notifications`, {
      component: "expiration",
      ...counts,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    errors.push(errorMessage);
  }

  return { ...counts, errors };
}

export async function sendExpiredNotifications(
  env: Env,
  expiredDeals: Deal[],
): Promise<void> {
  if (expiredDeals.length === 0) {
    return;
  }

  const dealList = expiredDeals
    .map((d) => `- ${d.code} (${d.source.domain}): expired on ${d.expiry.date}`)
    .join("\n");

  await notify(env, {
    type: "deal_expired",
    severity: "warning",
    run_id: `expiry-check-${Date.now()}`,
    message: `${expiredDeals.length} deal${expiredDeals.length === 1 ? "" : "s"} marked as expired:\n${dealList}`,
    context: {
      expired_count: expiredDeals.length,
      deals: expiredDeals.map((d) => ({
        id: d.id,
        code: d.code,
        domain: d.source.domain,
        expiry_date: d.expiry.date,
      })),
    },
  });

  logger.info(`Sent expired notifications for ${expiredDeals.length} deals`, {
    component: "expiration",
    count: expiredDeals.length,
  });
}
