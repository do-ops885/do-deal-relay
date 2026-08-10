import type { Deal, Env } from "../../types";
import {
  getActiveDeals,
  getProductionSnapshot,
  promoteToProduction,
  writeStagingSnapshot,
} from "../storage";
import { logger } from "../global-logger";
import { CONFIG } from "../../config";
import { notify } from "../../notify";
import { validatedFetch } from "../security";
import { toError } from "../sanitize-error";

// ============================================================================
// Deal URL Health Checking (NEW-PLAT-1: ADR-020 Phase 1)
// ============================================================================

const DEFAULT_HEALTH_CHECK_CONCURRENCY = 5;
const MIN_DOMAIN_REQUEST_INTERVAL_MS = 2000;
const DEFINITIVE_FAILURE_CODES = new Set([400, 404, 410, 451]);
const TRANSIENT_FAILURE_CODES = new Set([429, 500, 502, 503, 504]);

export interface UrlHealthResult {
  dealId: string;
  code: string;
  url: string;
  healthy: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Check URL health for a batch of deals by performing HEAD requests.
 * Handles rate limiting via concurrency control and per-domain throttling.
 */
export async function checkDealUrlHealth(
  env: Env,
  deals: Deal[],
  concurrency: number = DEFAULT_HEALTH_CHECK_CONCURRENCY,
): Promise<{
  checked: number;
  healthy: number;
  unhealthy: number;
  results: UrlHealthResult[];
  errors: string[];
}> {
  const results: UrlHealthResult[] = [];
  const errors: string[] = [];
  const domainNextRequestAt = new Map<string, number>();
  const requestedConcurrency = Number.isFinite(concurrency)
    ? Math.floor(concurrency)
    : DEFAULT_HEALTH_CHECK_CONCURRENCY;
  const effectiveConcurrency = Math.max(1, requestedConcurrency);

  // biome-ignore lint/correctness/useQwikValidLexicalScope: Qwik-specific rule; not a Qwik codebase
  function timeoutSignal(): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    );
    return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
  }

  // Process in batches with concurrency limit.
  for (let i = 0; i < deals.length; i += effectiveConcurrency) {
    const batch = deals.slice(i, i + effectiveConcurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (deal): Promise<UrlHealthResult> => {
        try {
          const domain = new URL(deal.url).hostname;
          const now = Date.now();
          const nextRequestAt = Math.max(
            now,
            domainNextRequestAt.get(domain) ?? now,
          );
          domainNextRequestAt.set(
            domain,
            nextRequestAt + MIN_DOMAIN_REQUEST_INTERVAL_MS,
          );
          if (nextRequestAt > now) {
            await new Promise((resolve) =>
              setTimeout(resolve, nextRequestAt - now),
            );
          }

          const { signal, cleanup } = timeoutSignal();
          try {
            const response = await validatedFetch(deal.url, {
              method: "HEAD",
              headers: { "User-Agent": CONFIG.USER_AGENT },
              signal,
              redirect: "follow",
            });

            return {
              dealId: deal.id,
              code: deal.code,
              url: deal.url,
              healthy: response.ok,
              statusCode: response.status,
            };
          } finally {
            cleanup();
          }
        } catch (error) {
          const err = toError(error);
          return {
            dealId: deal.id,
            code: deal.code,
            url: deal.url,
            healthy: false,
            error: err.message,
          };
        }
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        errors.push(toError(result.reason).message);
      }
    }
  }

  const healthy = results.filter((result) => result.healthy).length;
  const unhealthy = results.length - healthy;

  logger.info("URL health check completed", {
    component: "expiration",
    checked: results.length,
    healthy,
    unhealthy,
  });

  return {
    checked: results.length,
    healthy,
    unhealthy,
    results,
    errors,
  };
}

/**
 * Deactivate deals with definitive URL failures and flag transient failures.
 * Deactivations use the production snapshot's staging/promotion path so the
 * normal snapshot validation and hash-chain checks remain in force.
 */
export async function deactivateUnhealthyDeals(
  env: Env,
  healthResults: UrlHealthResult[],
): Promise<{
  deactivated: number;
  flagged: number;
  deals: string[];
}> {
  const unhealthy = healthResults.filter((result) => !result.healthy);
  const toDeactivate = unhealthy.filter(
    (result) =>
      result.statusCode !== undefined &&
      DEFINITIVE_FAILURE_CODES.has(result.statusCode),
  );
  const toFlag = unhealthy.filter(
    (result) =>
      result.statusCode === undefined ||
      TRANSIENT_FAILURE_CODES.has(result.statusCode) ||
      !DEFINITIVE_FAILURE_CODES.has(result.statusCode),
  );

  const deactivatedIds: string[] = [];
  if (toDeactivate.length > 0) {
    const snapshot = await getProductionSnapshot(env);
    if (!snapshot) {
      logger.warn("Cannot deactivate unhealthy deals without a snapshot", {
        component: "expiration",
      });
    } else {
      const deactivationById = new Map(
        toDeactivate.map((result) => [result.dealId, result]),
      );
      const checkedAt = new Date().toISOString();
      const updatedDeals = snapshot.deals.map((deal) => {
        const result = deactivationById.get(deal.id);
        if (!result || deal.metadata.status !== "active") return deal;

        deactivatedIds.push(deal.id);
        return {
          ...deal,
          metadata: {
            ...deal.metadata,
            status: "rejected" as const,
            deactivated_at: checkedAt,
            deactivated_reason: `url_health_http_${result.statusCode}`,
          },
        };
      });

      if (deactivatedIds.length > 0) {
        const updatedSnapshot = {
          ...snapshot,
          deals: updatedDeals,
          generated_at: checkedAt,
          previous_hash: snapshot.snapshot_hash,
          stats: {
            ...snapshot.stats,
            active: updatedDeals.filter(
              (deal) => deal.metadata.status === "active",
            ).length,
            rejected: updatedDeals.filter(
              (deal) => deal.metadata.status === "rejected",
            ).length,
          },
        };

        try {
          await writeStagingSnapshot(env, updatedSnapshot);
          await promoteToProduction(env, snapshot.snapshot_hash);
        } catch (error) {
          logger.warn("Failed to promote unhealthy deal deactivations", {
            component: "expiration",
            error: toError(error).message,
          });
          deactivatedIds.length = 0;
        }
      }
    }
  }

  for (const result of toFlag) {
    try {
      await env.DEALS_LOG.put(
        `flag:url-health:${result.dealId}`,
        JSON.stringify({
          dealId: result.dealId,
          code: result.code,
          url: result.url,
          error: result.error ?? `HTTP ${result.statusCode}`,
          flaggedAt: new Date().toISOString(),
          transient: true,
        }),
      );
    } catch {
      // Best-effort flagging must not fail the scheduled job.
    }
  }

  if (deactivatedIds.length > 0 || toFlag.length > 0) {
    logger.info("URL health deactivation results", {
      component: "expiration",
      deactivated: deactivatedIds.length,
      flagged: toFlag.length,
    });

    await notify(env, {
      type: "deal_health_check",
      severity: deactivatedIds.length > 0 ? "warning" : "info",
      run_id: `url-health-${Date.now()}`,
      message: `URL health check: ${deactivatedIds.length} deals deactivated, ${toFlag.length} flagged for review`,
      context: {
        deactivated: deactivatedIds,
        flaggedCount: toFlag.length,
        totalChecked: healthResults.length,
      },
    });
  }

  return {
    deactivated: deactivatedIds.length,
    flagged: toFlag.length,
    deals: deactivatedIds,
  };
}

/** Run the scheduled health check against active production deals. */
export async function runUrlHealthCheck(env: Env): Promise<{
  checked: number;
  healthy: number;
  unhealthy: number;
  deactivated: number;
  flagged: number;
}> {
  const activeDeals = await getActiveDeals(env);
  if (activeDeals.length === 0) {
    return {
      checked: 0,
      healthy: 0,
      unhealthy: 0,
      deactivated: 0,
      flagged: 0,
    };
  }

  const healthResult = await checkDealUrlHealth(env, activeDeals);
  const deactivationResult = await deactivateUnhealthyDeals(
    env,
    healthResult.results,
  );

  return {
    checked: healthResult.checked,
    healthy: healthResult.healthy,
    unhealthy: healthResult.unhealthy,
    deactivated: deactivationResult.deactivated,
    flagged: deactivationResult.flagged,
  };
}

// Re-export from existing validation module for convenience.
export { validateDealsBatch, deactivateInvalidDeals } from "./validation";
