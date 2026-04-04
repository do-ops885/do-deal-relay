import type { Deal, Env } from "../../types";
import { getActiveDeals, getProductionSnapshot } from "../storage";
import { logger } from "../global-logger";
import { CONFIG } from "../../config";
import { notify } from "../../notify";
import { storeValidationStats } from "./scheduling";

// ============================================================================
// Deal Validation
// ============================================================================

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

  const validCount = results.filter((r) => r.valid).length;
  const invalid = results.length - validCount;

  // Store validation stats
  await storeValidationStats(env, {
    timestamp: new Date().toISOString(),
    total: results.length,
    valid: validCount,
    invalid,
    errors: errors.length,
  });

  logger.info(`Batch validation completed`, {
    component: "expiration",
    validated: results.length,
    valid: validCount,
    invalid,
  });

  return {
    validated: results.length,
    invalid,
    errors,
    results,
  };
}

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

  const updatedDeals = snapshot.deals.map((deal: Deal) => {
    if (deal.metadata.status !== "active") {
      return deal;
    }

    // Check if deal should be deactivated
    let shouldDeactivate = false;
    let reason = "";

    // Check expiration
    if (deal.expiry.date) {
      const expiryDate = new Date(deal.expiry.date);
      if (expiryDate <= now) {
        shouldDeactivate = true;
        reason = "expired";
      }
    }

    // Check for invalid code
    if (!deal.code || deal.code.trim().length === 0) {
      shouldDeactivate = true;
      reason = "invalid_code";
    }

    // Check for invalid URL
    try {
      new URL(deal.url);
    } catch {
      shouldDeactivate = true;
      reason = "invalid_url";
    }

    if (shouldDeactivate) {
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
        await import("../storage");

      const updatedSnapshot = {
        ...snapshot,
        deals: updatedDeals,
        generated_at: now.toISOString(),
        stats: {
          ...snapshot.stats,
          active: updatedDeals.filter(
            (d: Deal) => d.metadata.status === "active",
          ).length,
          rejected: updatedDeals.filter(
            (d: Deal) => d.metadata.status === "rejected",
          ).length,
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
            const deal = updatedDeals.find((d: Deal) => d.id === id);
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
