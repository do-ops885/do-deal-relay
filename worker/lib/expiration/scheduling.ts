import type { Env } from "../../types";
import { logger } from "../global-logger";

// ============================================================================
// Constants
// ============================================================================

export const EXPIRY_CHECK_KEY = "meta:last_expiry_check";
export const EXPIRED_DEALS_KEY = "meta:expired_deals";
export const NOTIFIED_EXPIRING_KEY = "meta:notified_expiring";
export const VALIDATION_STATS_KEY = "meta:validation_stats";
export const LAST_VALIDATION_KEY = "meta:last_validation";

// ============================================================================
// Scheduling and Stats
// ============================================================================

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

  logger.info(`Next expiry check scheduled for ${nextCheck.toISOString()}`, {
    component: "expiration",
    scheduled_at: nextCheck.toISOString(),
  });
}

export async function storeValidationStats(
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

export async function getNotifiedExpiringDeals(env: Env): Promise<string[]> {
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

export async function recordNotifiedExpiringDeals(
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
