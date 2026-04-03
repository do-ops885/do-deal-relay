import { Deal, ExpiringDeal } from "../types";
import type { Env } from "../types";
import { getProductionSnapshot, getActiveDeals } from "./storage";
import { notify } from "../notify";
import { CONFIG } from "../config";
import { logger } from "./global-logger";

// ============================================================================
// Deal Expiration Management
// ============================================================================

const EXPIRY_CHECK_KEY = "meta:last_expiry_check";
const EXPIRED_DEALS_KEY = "meta:expired_deals";
const NOTIFIED_EXPIRING_KEY = "meta:notified_expiring";
const VALIDATION_STATS_KEY = "meta:validation_stats";
const LAST_VALIDATION_KEY = "meta:last_validation";

// ============================================================================
// Expiring Deals
// ============================================================================

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
 * Check for deals expiring within specified days
 * Enhanced version with logging
 */
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

// ============================================================================
// Deal Validation
// ============================================================================

/**
 * Validate deals in batch
 * Performs validation checks on a batch of deals
 */
export async function validateDealsBatch(
  env: Env,
  batchSize: number = 50,
): Promise<{
  validated: number;
  invalid: number;
  errors: string[];
  results: Array<{
    dealId: string;
    code: string;
    valid: boolean;
    reason?: string;
  }>;
}> {
  const activeDeals = await getActiveDeals(env);
  const batch = activeDeals.slice(0, batchSize);
  const results: Array<{
    dealId: string;
    code: string;
    valid: boolean;
    reason?: string;
  }> = [];
  const errors: string[] = [];

  logger.info(`Starting batch validation for ${batch.length} deals`, {
    component: "expiration",
    batchSize: batch.length,
  });

  for (const deal of batch) {
    try {
      // Basic validation checks
      const issues: string[] = [];

      // Check if deal has expired
      if (deal.expiry.date) {
        const expiryDate = new Date(deal.expiry.date);
        if (expiryDate <= new Date()) {
          issues.push("Deal has expired");
        }
      }

      // Check if code is present
      if (!deal.code || deal.code.trim().length === 0) {
        issues.push("Missing referral code");
      }

      // Check if URL is valid format
      try {
        new URL(deal.url);
      } catch {
        issues.push("Invalid URL format");
      }

      // Check reward plausibility
      if (typeof deal.reward.value === "number") {
        if (deal.reward.value > CONFIG.MAX_REWARD_VALUE) {
          issues.push(`Reward value exceeds maximum: ${deal.reward.value}`);
        }
        if (deal.reward.value < 0) {
          issues.push("Negative reward value");
        }
      }

      const valid = issues.length === 0;

      results.push({
        dealId: deal.id,
        code: deal.code,
        valid,
        reason: issues.join(", ") || undefined,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to validate deal ${deal.id}: ${errorMessage}`);

      results.push({
        dealId: deal.id,
        code: deal.code,
        valid: false,
        reason: errorMessage,
      });
    }
  }

  const valid = results.filter((r) => r.valid).length;
  const invalid = results.length - valid;

  // Store validation stats
  await storeValidationStats(env, {
    timestamp: new Date().toISOString(),
    total: results.length,
    valid,
    invalid,
    errors: errors.length,
  });

  logger.info(`Batch validation completed`, {
    component: "expiration",
    validated: results.length,
    valid,
    invalid,
  });

  return {
    validated: results.length,
    invalid,
    errors,
    results,
  };
}

/**
 * Deactivate invalid deals
 * Marks deals that failed validation as rejected
 */
export async function deactivateInvalidDeals(env: Env): Promise<{
  deactivated: number;
  deals: string[];
  errors: string[];
}> {
  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) {
    return {
      deactivated: 0,
      deals: [],
      errors: ["No production snapshot found"],
    };
  }

  const deactivated: string[] = [];
  const errors: string[] = [];
  const now = new Date();

  const updatedDeals = snapshot.deals.map((deal) => {
    if (deal.metadata.status !== "active") {
      return deal;
    }

    // Check if deal should be deactivated
    let deactivate = false;
    let reason = "";

    // Check expiration
    if (deal.expiry.date) {
      const expiryDate = new Date(deal.expiry.date);
      if (expiryDate <= now) {
        deactivate = true;
        reason = "expired";
      }
    }

    // Check for invalid code
    if (!deal.code || deal.code.trim().length === 0) {
      deactivate = true;
      reason = "invalid_code";
    }

    // Check for invalid URL
    try {
      new URL(deal.url);
    } catch {
      deactivate = true;
      reason = "invalid_url";
    }

    if (deactivate) {
      deactivated.push(deal.id);
      return {
        ...deal,
        metadata: {
          ...deal.metadata,
          status: "rejected" as const,
          deactivated_at: now.toISOString(),
          deactivated_reason: reason,
        },
      };
    }

    return deal;
  });

  // Only update if we found invalid deals
  if (deactivated.length > 0) {
    try {
      const { writeStagingSnapshot, promoteToProduction } =
        await import("./storage");

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

      await writeStagingSnapshot(env, updatedSnapshot);
      await promoteToProduction(env, snapshot.snapshot_hash);

      // Send notification
      await notify(env, {
        type: "deal_expired",
        severity: "warning",
        run_id: `auto-deactivate-${Date.now()}`,
        message: `${deactivated.length} invalid/expired deal(s) automatically deactivated`,
        context: {
          deactivated_count: deactivated.length,
          deals: deactivated.map((id) => {
            const deal = updatedDeals.find((d) => d.id === id);
            const metadata = deal?.metadata as
              | { deactivated_reason?: string }
              | undefined;
            return {
              id,
              code: deal?.code,
              reason: metadata?.deactivated_reason ?? "expired",
            };
          }),
        },
      });

      logger.info(`Auto-deactivated ${deactivated.length} invalid deals`, {
        component: "expiration",
        deactivated: deactivated.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to update deals: ${errorMessage}`);
    }
  }

  return {
    deactivated: deactivated.length,
    deals: deactivated,
    errors,
  };
}

// ============================================================================
// Notifications
// ============================================================================

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
 * Notify about expiring deals
 * Enhanced notification with urgency levels
 */
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

// ============================================================================
// Mark Expired Deals
// ============================================================================

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

// ============================================================================
// Scheduling and Stats
// ============================================================================

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
 * Store validation statistics
 */
async function storeValidationStats(
  env: Env,
  stats: {
    timestamp: string;
    total: number;
    valid: number;
    invalid: number;
    errors: number;
  },
): Promise<void> {
  await env.DEALS_PROD.put(VALIDATION_STATS_KEY, JSON.stringify(stats));
}

/**
 * Get validation statistics
 */
export async function getValidationStats(env: Env): Promise<{
  timestamp: string;
  total: number;
  valid: number;
  invalid: number;
  errors: number;
} | null> {
  return env.DEALS_PROD.get<{
    timestamp: string;
    total: number;
    valid: number;
    invalid: number;
    errors: number;
  }>(VALIDATION_STATS_KEY, "json");
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

// ============================================================================
// Main Entry Points
// ============================================================================

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
 * Run full validation sweep
 * Comprehensive validation of all active deals
 */
export async function runFullValidationSweep(env: Env): Promise<{
  validated: number;
  deactivated: number;
  expiringNotified: number;
  errors: string[];
}> {
  const errors: string[] = [];

  logger.info("Starting full validation sweep", {
    component: "expiration",
  });

  // 1. Run batch validation
  const validationResult = await validateDealsBatch(env, 100);
  if (validationResult.errors.length > 0) {
    errors.push(...validationResult.errors);
  }

  // 2. Deactivate invalid deals
  const deactivationResult = await deactivateInvalidDeals(env);
  if (deactivationResult.errors.length > 0) {
    errors.push(...deactivationResult.errors);
  }

  // 3. Notify about expiring deals
  const notifyResult = await notifyExpiringDeals(env);

  // 4. Store last validation timestamp
  await env.DEALS_PROD.put(
    LAST_VALIDATION_KEY,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      results: {
        validated: validationResult.validated,
        deactivated: deactivationResult.deactivated,
        notified: notifyResult.notified,
      },
    }),
  );

  logger.info("Full validation sweep completed", {
    component: "expiration",
    validated: validationResult.validated,
    deactivated: deactivationResult.deactivated,
    notified: notifyResult.notified,
  });

  return {
    validated: validationResult.validated,
    deactivated: deactivationResult.deactivated,
    expiringNotified: notifyResult.notified,
    errors,
  };
}

/**
 * Get last validation results
 */
export async function getLastValidationResults(env: Env): Promise<{
  timestamp: string;
  results: {
    validated: number;
    deactivated: number;
    notified: number;
  };
} | null> {
  return env.DEALS_PROD.get<{
    timestamp: string;
    results: {
      validated: number;
      deactivated: number;
      notified: number;
    };
  }>(LAST_VALIDATION_KEY, "json");
}

// ============================================================================
// Utility Functions
// ============================================================================

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
