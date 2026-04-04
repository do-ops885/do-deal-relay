import type { Deal, ExpiringDeal, Env } from "../../types";
import { getActiveDeals } from "../storage";
import { logger } from "../global-logger";
import { EXPIRY_CHECK_KEY, NOTIFIED_EXPIRING_KEY } from "./scheduling";

// Re-export constants for backwards compatibility
export {
  EXPIRY_CHECK_KEY,
  EXPIRED_DEALS_KEY,
  NOTIFIED_EXPIRING_KEY,
  VALIDATION_STATS_KEY,
  LAST_VALIDATION_KEY,
} from "./scheduling";

// ============================================================================
// Find Expiring Deals
// ============================================================================

export async function findExpiringDeals(
  env: Env,
  windowDays: number,
): Promise<ExpiringDeal[]> {
  const activeDeals = await getActiveDeals(env);
  const now = new Date();
  const expiringDeals: ExpiringDeal[] = [];

  for (const deal of activeDeals) {
    if (!deal.expiry.date) {
      continue;
    }

    const expiryDate = new Date(deal.expiry.date);
    const daysUntilExpiry = Math.ceil(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Deal is expiring within the window (but not already expired)
    if (daysUntilExpiry > 0 && daysUntilExpiry <= windowDays) {
      let notificationWindow: "7d" | "30d" | "90d";
      if (windowDays <= 7) {
        notificationWindow = "7d";
      } else if (windowDays <= 30) {
        notificationWindow = "30d";
      } else {
        notificationWindow = "90d";
      }

      expiringDeals.push({
        deal,
        daysUntilExpiry,
        notificationWindow,
      });
    }
  }

  // Sort by days until expiry (most urgent first)
  expiringDeals.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  logger.info(
    `Found ${expiringDeals.length} deals expiring within ${windowDays} days`,
    {
      component: "expiration",
      count: expiringDeals.length,
      windowDays,
    },
  );
  return expiringDeals;
}

export async function checkExpiringDeals(
  env: Env,
  days: number,
): Promise<{
  deals: ExpiringDeal[];
  count: number;
  byUrgency: {
    critical: number; // 1-3 days
    high: number; // 4-7 days
    medium: number; // 8-14 days
    low: number; // 15+ days
  };
}> {
  const expiringDeals = await findExpiringDeals(env, days);

  const byUrgency = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const deal of expiringDeals) {
    if (deal.daysUntilExpiry <= 3) {
      byUrgency.critical++;
    } else if (deal.daysUntilExpiry <= 7) {
      byUrgency.high++;
    } else if (deal.daysUntilExpiry <= 14) {
      byUrgency.medium++;
    } else {
      byUrgency.low++;
    }
  }

  logger.info(`Checked expiring deals: ${expiringDeals.length} found`, {
    component: "expiration",
    days,
    count: expiringDeals.length,
    byUrgency,
  });

  return {
    deals: expiringDeals,
    count: expiringDeals.length,
    byUrgency,
  };
}
