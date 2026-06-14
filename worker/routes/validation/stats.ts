import type { Env } from "../../types";
import { jsonResponse, errorResponse } from "../utils";
import { getSupportedProviders } from "../../lib/validation/code-validator";
import { getActiveDeals, getProductionSnapshot } from "../../lib/storage";
import {
  getValidationStats,
  getLastValidationResults,
} from "../../lib/expiration";
import { logger } from "../../lib/global-logger";

export async function handleGetValidationStats(
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    const [validationStats, lastRun, activeDeals, snapshot] = await Promise.all(
      [
        getValidationStats(env),
        getLastValidationResults(env),
        getActiveDeals(env),
        getProductionSnapshot(env),
      ],
    );

    const withExpiry = activeDeals.filter((d) => d.expiry.date).length;
    const expired = activeDeals.filter((d) => {
      if (!d.expiry.date) return false;
      return new Date(d.expiry.date) <= new Date();
    }).length;
    const expiring7Days = activeDeals.filter((d) => {
      if (!d.expiry.date) return false;
      const daysUntil = Math.ceil(
        (new Date(d.expiry.date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
      return daysUntil > 0 && daysUntil <= 7;
    }).length;

    const stats = {
      validation: validationStats || {
        timestamp: null,
        total: 0,
        valid: 0,
        invalid: 0,
        errors: 0,
      },
      last_run: lastRun || null,
      deals: {
        total: snapshot?.stats.total || 0,
        active: activeDeals.length,
        with_expiry: withExpiry,
        expired: expired,
        expiring_7d: expiring7Days,
        no_expiry: activeDeals.length - withExpiry,
      },
      providers: {
        supported: getSupportedProviders(),
      },
      generated_at: new Date().toISOString(),
    };

    return jsonResponse(stats, 200, request, env);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get stats";
    logger.error("Get validation stats error", {
      component: "validation-api",
      error: errorMessage,
    });
    return errorResponse(
      "Failed to get validation stats",
      500,
      { detail: errorMessage },
      request,
      env,
    );
  }
}
