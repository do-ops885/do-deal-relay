import type { Deal, Env } from "../../types";
import { getProductionSnapshot } from "../storage";
import { logger } from "../global-logger";
import { sendExpiredNotifications } from "./notifications";
import {
  EXPIRY_CHECK_KEY,
  VALIDATION_STATS_KEY,
  NOTIFIED_EXPIRING_KEY,
  LAST_VALIDATION_KEY,
} from "./finding";

// ============================================================================
// Mark Expired Deals
// ============================================================================

export async function markExpiredDeals(env: Env): Promise<number> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) {
    logger.warn("No production snapshot found", {
      component: "expiration",
    });
    return 0;
  }

  const now = new Date();
  let expiredCount = 0;
  const newlyExpired: string[] = [];

  const updatedDeals = snapshot.deals.map((deal: Deal) => {
    if (deal.metadata.status !== "active" || !deal.expiry.date) {
      return deal;
    }

    const expiryDate = new Date(deal.expiry.date);
    if (expiryDate <= now) {
      expiredCount++;
      newlyExpired.push(deal.id);
      return {
        ...deal,
        metadata: {
          ...deal.metadata,
          status: "rejected" as const,
          expired_at: now.toISOString(),
        },
      };
    }

    return deal;
  });

  // Only update if we found expired deals
  if (expiredCount > 0) {
    const { writeStagingSnapshot, promoteToProduction } =
      await import("../storage");

    // Create updated snapshot
    const updatedSnapshot = {
      ...snapshot,
      deals: updatedDeals,
      generated_at: now.toISOString(),
      stats: {
        ...snapshot.stats,
        active: updatedDeals.filter((d: Deal) => d.metadata.status === "active")
          .length,
        rejected: updatedDeals.filter(
          (d: Deal) => d.metadata.status === "rejected",
        ).length,
      },
    };

    // Write to staging and promote
    await writeStagingSnapshot(env, updatedSnapshot);
    await promoteToProduction(env, snapshot.snapshot_hash);

    // Send notifications for newly expired deals
    const expiredDeals = updatedDeals.filter((d: Deal) =>
      newlyExpired.includes(d.id),
    );
    await sendExpiredNotifications(env, expiredDeals);

    logger.info(`Marked ${expiredCount} deals as expired`, {
      component: "expiration",
      count: expiredCount,
    });
  }

  return expiredCount;
}
