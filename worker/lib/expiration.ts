import { Deal, ExpiringDeal } from "../types";
import type { Env } from "../types";
import { getProductionSnapshot, getActiveDeals } from "./storage";
import { notify } from "../notify";
import { CONFIG } from "../config";

// ============================================================================
// Deal Expiration Management
// ============================================================================

const EXPIRY_CHECK_KEY = "meta:last_expiry_check";
const EXPIRED_DEALS_KEY = "meta:expired_deals";
const NOTIFIED_EXPIRING_KEY = "meta:notified_expiring";

/**
 * Find deals approaching expiration within a given window
 */
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

  console.log(
    `Found ${expiringDeals.length} deals expiring within ${windowDays} days`,
  );
  return expiringDeals;
}

/**
 * Mark expired deals and return count of newly marked deals
 */
export async function markExpiredDeals(env: Env): Promise<number> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) {
    console.log("No production snapshot found");
    return 0;
  }

  const now = new Date();
  let expiredCount = 0;
  const newlyExpired: string[] = [];

  // Get already notified deals to avoid duplicate notifications
  const alreadyNotified = await getNotifiedExpiringDeals(env);

  const updatedDeals = snapshot.deals.map((deal) => {
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
      await import("./storage");

    // Create updated snapshot
    const updatedSnapshot = {
      ...snapshot,
      deals: updatedDeals,
      generated_at: now.toISOString(),
      stats: {
        ...snapshot.stats,
        active: updatedDeals.filter((d) => d.metadata.status === "active")
          .length,
        rejected: updatedDeals.filter((d) => d.metadata.status === "rejected")
          .length,
      },
    };

    // Write to staging and promote
    await writeStagingSnapshot(env, updatedSnapshot);
    await promoteToProduction(env, snapshot.snapshot_hash);

    // Send notifications for newly expired deals
    const expiredDeals = updatedDeals.filter((d) =>
      newlyExpired.includes(d.id),
    );
    await sendExpiredNotifications(env, expiredDeals);

    console.log(`Marked ${expiredCount} deals as expired`);
  }

  return expiredCount;
}

/**
 * Send notifications for deals approaching expiration
 */
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
    console.log("All expiring deals already notified");
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

  console.log(`Sent expiry notifications for ${dealsToNotify.length} deals`);
}

/**
 * Send notifications for expired deals
 */
async function sendExpiredNotifications(
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

  console.log(`Sent expired notifications for ${expiredDeals.length} deals`);
}

/**
 * Schedule next expiration check
 */
export async function scheduleExpiryCheck(env: Env): Promise<void> {
  const nextCheck = new Date();
  nextCheck.setDate(nextCheck.getDate() + 1); // Next day at same time
  nextCheck.setHours(9, 0, 0, 0); // 9 AM

  await env.DEALS_PROD.put(
    EXPIRY_CHECK_KEY,
    JSON.stringify({
      scheduled_at: nextCheck.toISOString(),
      checked_at: new Date().toISOString(),
    }),
  );

  console.log(`Next expiry check scheduled for ${nextCheck.toISOString()}`);
}

/**
 * Get list of already notified expiring deals
 */
async function getNotifiedExpiringDeals(env: Env): Promise<string[]> {
  try {
    const data = await env.DEALS_PROD.get<{
      deals: string[];
      notified_at: string;
    }>(NOTIFIED_EXPIRING_KEY, "json");

    if (!data) return [];

    // Only consider notifications from last 24 hours to avoid forever deduplication
    const notifiedAt = new Date(data.notified_at);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (notifiedAt < oneDayAgo) {
      return [];
    }

    return data.deals;
  } catch {
    return [];
  }
}

/**
 * Record deals that have been notified about expiring
 */
async function recordNotifiedExpiringDeals(
  env: Env,
  dealIds: string[],
): Promise<void> {
  const existing = await getNotifiedExpiringDeals(env);
  const combined = [...new Set([...existing, ...dealIds])];

  await env.DEALS_PROD.put(
    NOTIFIED_EXPIRING_KEY,
    JSON.stringify({
      deals: combined,
      notified_at: new Date().toISOString(),
    }),
  );
}

/**
 * Main entry point for checking deal expirations
 * This is called by the scheduled handler
 */
export async function checkDealExpirations(env: Env): Promise<{
  expiringFound: number;
  expiredMarked: number;
  notificationsSent: number;
}> {
  console.log("Starting deal expiration check...");

  // 1. Find deals expiring soon (multiple windows)
  const expiring7Days = await findExpiringDeals(env, 7);
  const expiring30Days = await findExpiringDeals(env, 30);

  // Combine and deduplicate (keep most urgent window)
  const seen = new Set<string>();
  const allExpiring: ExpiringDeal[] = [];

  for (const ed of [...expiring7Days, ...expiring30Days]) {
    if (!seen.has(ed.deal.id)) {
      seen.add(ed.deal.id);
      allExpiring.push(ed);
    }
  }

  // 2. Send notifications for expiring deals
  await sendExpiryNotifications(env, allExpiring);

  // 3. Mark expired deals
  const expiredCount = await markExpiredDeals(env);

  // 4. Schedule next check
  await scheduleExpiryCheck(env);

  const result = {
    expiringFound: allExpiring.length,
    expiredMarked: expiredCount,
    notificationsSent: allExpiring.length,
  };

  console.log("Deal expiration check completed:", result);
  return result;
}

/**
 * Check if a deal is expiring soon (within specified days)
 */
export function isExpiringSoon(deal: Deal, days: number): boolean {
  if (!deal.expiry.date || deal.metadata.status !== "active") {
    return false;
  }

  const expiryDate = new Date(deal.expiry.date);
  const now = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  return daysUntilExpiry > 0 && daysUntilExpiry <= days;
}

/**
 * Calculate urgency score for deals (used in scoring phase)
 * Higher score = more urgent
 */
export function calculateExpiryUrgency(deal: Deal): number {
  if (!deal.expiry.date || deal.metadata.status !== "active") {
    return 0;
  }

  const expiryDate = new Date(deal.expiry.date);
  const now = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntilExpiry <= 0) {
    return 1.0; // Already expired - maximum urgency
  }

  if (daysUntilExpiry <= 7) {
    return 0.8; // Expiring within a week - high urgency
  }

  if (daysUntilExpiry <= 30) {
    return 0.5; // Expiring within a month - medium urgency
  }

  if (daysUntilExpiry <= 90) {
    return 0.2; // Expiring within 3 months - low urgency
  }

  return 0; // Not expiring soon
}
