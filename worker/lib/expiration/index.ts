import type { Deal, Env } from "../../types";
import { logger } from "../global-logger";
import { findExpiringDeals, checkExpiringDeals } from "./finding";
import { validateDealsBatch, deactivateInvalidDeals } from "./validation";
import { sendExpiryNotifications, notifyExpiringDeals } from "./notifications";
import { markExpiredDeals } from "./mark-expired";
import {
  scheduleExpiryCheck,
  LAST_VALIDATION_KEY,
  getValidationStats,
  getLastValidationResults,
} from "./scheduling";

// Re-export all functions
export { findExpiringDeals, checkExpiringDeals } from "./finding";

export { validateDealsBatch, deactivateInvalidDeals } from "./validation";

export { sendExpiryNotifications, notifyExpiringDeals } from "./notifications";

export { markExpiredDeals } from "./mark-expired";

export {
  scheduleExpiryCheck,
  getValidationStats,
  getLastValidationResults,
} from "./scheduling";

// ============================================================================
// Main Entry Points
// ============================================================================

export async function checkDealExpirations(env: Env): Promise<{
  expiringFound: number;
  expiredMarked: number;
  notificationsSent: number;
}> {
  logger.info("Starting deal expiration check...", {
    component: "expiration",
  });

  // 1. Find deals expiring soon (multiple windows)
  const expiring7Days = await findExpiringDeals(env, 7);
  const expiring30Days = await findExpiringDeals(env, 30);

  // Combine and deduplicate (keep most urgent window)
  const seen = new Set<string>();
  const allExpiring = [];

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

  logger.info("Deal expiration check completed", {
    component: "expiration",
    ...result,
  });
  return result;
}

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

// ============================================================================
// Utility Functions
// ============================================================================

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
