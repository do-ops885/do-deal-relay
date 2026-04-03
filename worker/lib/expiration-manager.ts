// ============================================================================
// Expiration Manager - Track and notify about expiring deals
// ============================================================================

import type { Deal, Env, ExpiringDeal } from "../types";
import { notify } from "../notify";

const EXPIRY_WINDOWS = [7, 30, 90] as const;
type ExpiryWindow = (typeof EXPIRY_WINDOWS)[number];

interface ExpiryCheckResult {
  expiringDeals: ExpiringDeal[];
  notificationsSent: number;
  errors: string[];
}

/**
 * Find deals that are expiring within the specified window
 */
export function findExpiringDeals(
  deals: Deal[],
  windowDays: ExpiryWindow,
): ExpiringDeal[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  return deals
    .filter((deal) => {
      if (!deal.expiry.date) return false;
      const expiry = new Date(deal.expiry.date);
      return expiry > now && expiry <= cutoff;
    })
    .map((deal) => ({
      deal,
      daysUntilExpiry: Math.ceil(
        (new Date(deal.expiry.date!).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
      notificationWindow: `${windowDays}d` as ExpiryWindow extends 7
        ? "7d"
        : ExpiryWindow extends 30
          ? "30d"
          : "90d",
    }));
}

/**
 * Check all expiry windows and return deals grouped by window
 */
export function checkAllExpiryWindows(
  deals: Deal[],
): Record<string, ExpiringDeal[]> {
  return {
    "7d": findExpiringDeals(deals, 7),
    "30d": findExpiringDeals(deals, 30),
    "90d": findExpiringDeals(deals, 90),
  };
}

/**
 * Send notifications for expiring deals
 */
export async function sendExpiryNotifications(
  env: Env,
  expiringDeals: ExpiringDeal[],
  runId: string,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  // Group by window for batched notifications
  const grouped = expiringDeals.reduce(
    (acc, deal) => {
      const window = deal.notificationWindow;
      if (!acc[window]) acc[window] = [];
      acc[window].push(deal);
      return acc;
    },
    {} as Record<string, ExpiringDeal[]>,
  );

  for (const [window, deals] of Object.entries(grouped)) {
    try {
      if (deals.length === 0) continue;

      // Send batched notification for this window
      await notify(env, {
        type: "deal_expiring",
        severity:
          window === "7d" ? "critical" : window === "30d" ? "warning" : "info",
        run_id: runId,
        message: `${deals.length} deal(s) expiring within ${window}`,
        context: {
          window,
          deal_count: deals.length,
          deals: deals.map((d) => ({
            id: d.deal.id,
            code: d.deal.code,
            title: d.deal.title,
            days_until_expiry: d.daysUntilExpiry,
            expiry_date: d.deal.expiry.date,
          })),
        },
      });

      sent++;
    } catch (error) {
      errors.push(
        `Failed to send ${window} notification: ${(error as Error).message}`,
      );
    }
  }

  return { sent, errors };
}

/**
 * Check for newly expired deals (just crossed the expiry date)
 */
export function findNewlyExpiredDeals(
  currentDeals: Deal[],
  previousDeals: Deal[],
): Deal[] {
  const now = new Date();
  const currentExpired = new Set(
    currentDeals
      .filter((d) => d.expiry.date && new Date(d.expiry.date) <= now)
      .map((d) => d.id),
  );

  const previousExpired = new Set(
    previousDeals
      .filter((d) => d.expiry.date && new Date(d.expiry.date) <= now)
      .map((d) => d.id),
  );

  // Deals that are now expired but weren't before
  const newlyExpiredIds = [...currentExpired].filter(
    (id) => !previousExpired.has(id),
  );

  return currentDeals.filter((d) => newlyExpiredIds.includes(d.id));
}

/**
 * Send notifications for newly expired deals
 */
export async function sendExpiredNotifications(
  env: Env,
  newlyExpired: Deal[],
  runId: string,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  if (newlyExpired.length === 0) {
    return { sent, errors };
  }

  try {
    await notify(env, {
      type: "deal_expired",
      severity: "warning",
      run_id: runId,
      message: `${newlyExpired.length} deal(s) have just expired`,
      context: {
        expired_count: newlyExpired.length,
        deals: newlyExpired.map((d) => ({
          id: d.id,
          code: d.code,
          title: d.title,
          expiry_date: d.expiry.date,
        })),
      },
    });

    sent = 1;
  } catch (error) {
    errors.push(
      `Failed to send expired notification: ${(error as Error).message}`,
    );
  }

  return { sent, errors };
}

/**
 * Main expiration check - runs during pipeline finalize phase
 */
export async function runExpirationCheck(
  env: Env,
  currentDeals: Deal[],
  previousDeals: Deal[] | undefined,
  runId: string,
): Promise<ExpiryCheckResult> {
  const expiringDeals: ExpiringDeal[] = [];
  const errors: string[] = [];
  let notificationsSent = 0;

  // Check for newly expired deals
  if (previousDeals) {
    const newlyExpired = findNewlyExpiredDeals(currentDeals, previousDeals);
    if (newlyExpired.length > 0) {
      const result = await sendExpiredNotifications(env, newlyExpired, runId);
      notificationsSent += result.sent;
      errors.push(...result.errors);
    }
  }

  // Check for deals expiring soon
  const expiringByWindow = checkAllExpiryWindows(currentDeals);

  // Priority: 7d first (critical), then 30d, then 90d
  for (const window of [7, 30, 90] as const) {
    const windowDeals = expiringByWindow[`${window}d`];
    if (windowDeals.length > 0) {
      expiringDeals.push(...windowDeals);

      // Only send notifications for 7d and 30d windows
      // 90d is too far out for immediate notification
      if (window <= 30) {
        const result = await sendExpiryNotifications(env, windowDeals, runId);
        notificationsSent += result.sent;
        errors.push(...result.errors);
      }
    }
  }

  return {
    expiringDeals,
    notificationsSent,
    errors,
  };
}

/**
 * Get expiration statistics
 */
export function getExpirationStats(deals: Deal[]): {
  total: number;
  withExpiry: number;
  expired: number;
  expiring7d: number;
  expiring30d: number;
  expiring90d: number;
  noExpiry: number;
} {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in90d = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  let withExpiry = 0;
  let expired = 0;
  let expiring7d = 0;
  let expiring30d = 0;
  let expiring90d = 0;
  let noExpiry = 0;

  for (const deal of deals) {
    if (!deal.expiry.date) {
      noExpiry++;
      continue;
    }

    withExpiry++;
    const expiry = new Date(deal.expiry.date);

    if (expiry <= now) {
      expired++;
    } else if (expiry <= in7d) {
      expiring7d++;
    } else if (expiry <= in30d) {
      expiring30d++;
    } else if (expiry <= in90d) {
      expiring90d++;
    }
  }

  return {
    total: deals.length,
    withExpiry,
    expired,
    expiring7d,
    expiring30d,
    expiring90d,
    noExpiry,
  };
}
