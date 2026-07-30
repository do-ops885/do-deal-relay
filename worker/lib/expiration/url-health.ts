import type { Deal, Env } from "../../types";
import { getActiveDeals } from "../storage";
import { logger } from "../global-logger";
import { CONFIG } from "../../config";
import { notify } from "../../notify";
import { storeValidationStats } from "./scheduling";
import { validatedFetch } from "../security";
import { toError } from "../sanitize-error";

// ============================================================================
// Deal URL Health Checking (NEW-PLAT-1: ADR-020 Phase 1)
// ============================================================================

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
  concurrency: number = 5,
): Promise<{
  checked: number;
  healthy: number;
  unhealthy: number;
  results: UrlHealthResult[];
  errors: string[];
}> {
  const results: UrlHealthResult[] = [];
  const errors: string[] = [];
  const domainLastRequest = new Map<string, number>();
  const MIN_DOMAIN_INTERVAL_MS = 2000; // 2s between requests to same domain

  const timeoutSignal = () => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONFIG.RESEARCH_FETCH_TIMEOUT_MS,
    );
    return { signal: controller.signal, cleanup: () => clearTimeout(timeout) };
  };

  // Process in batches with concurrency limit
  for (let i = 0; i < deals.length; i += concurrency) {
    const batch = deals.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (deal): Promise<UrlHealthResult> => {
        try {
          // Rate limit by domain to be polite
          const domain = new URL(deal.url).hostname;
          const lastRequest = domainLastRequest.get(domain) || 0;
          const elapsed = Date.now() - lastRequest;
          if (elapsed < MIN_DOMAIN_INTERVAL_MS) {
            await new Promise((r) =>
              setTimeout(r, MIN_DOMAIN_INTERVAL_MS - elapsed),
            );
          }
          domainLastRequest.set(domain, Date.now());

          const { signal, cleanup } = timeoutSignal();
          try {
            const response = await validatedFetch(deal.url, {
              method: "HEAD",
              headers: {
                "User-Agent": CONFIG.USER_AGENT,
              },
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
          // Network errors or timeouts mean unhealthy
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
        errors.push(result.reason?.message || "Unknown error in batch");
      }
    }
  }

  const healthy = results.filter((r) => r.healthy).length;
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
 * Deactivate deals with unhealthy URLs (404, connection refused, etc).
 * Only deactivates deals with definitive failure codes (404, 410, 5xx after retry).
 * Transient errors (timeouts, 429, 503) are noted but not auto-deactivated.
 */
export async function deactivateUnhealthyDeals(
  env: Env,
  healthResults: UrlHealthResult[],
): Promise<{
  deactivated: number;
  flagged: number;
  deals: string[];
}> {
  const DEFINITIVE_FAILURE_CODES = [404, 410, 400, 451]; // Permanent failures
  const TRANSIENT_CODES = [429, 500, 502, 503, 504]; // May recover

  const unhealthy = healthResults.filter((r) => !r.healthy);
  const toDeactivate = unhealthy.filter(
    (r) =>
      r.statusCode !== undefined && DEFINITIVE_FAILURE_CODES.includes(r.statusCode),
  );
  const toFlag = unhealthy.filter(
    (r) =>
      r.statusCode === undefined || // Network error
      TRANSIENT_CODES.includes(r.statusCode!),
  );

  const deactivatedIds: string[] = [];
  for (const result of toDeactivate) {
    try {
      // Mark deal as rejected in staging
      const key = `deal:${result.dealId}:status`;
      await env.DEALS_STAGING.put(
        key,
        JSON.stringify({
          status: "rejected",
          reason: `URL health check failed: HTTP ${result.statusCode}`,
          checkedAt: new Date().toISOString(),
        }),
      );
      deactivatedIds.push(result.dealId);
    } catch (error) {
      logger.warn("Failed to deactivate unhealthy deal", {
        component: "expiration",
        dealId: result.dealId,
        error: toError(error).message,
      });
    }
  }

  // Flag transient errors for review
  for (const result of toFlag) {
    try {
      const flagKey = `flag:url-health:${result.dealId}`;
      await env.DEALS_LOG.put(
        flagKey,
        JSON.stringify({
          dealId: result.dealId,
          code: result.code,
          url: result.url,
          error: result.error || `HTTP ${result.statusCode}`,
          flaggedAt: new Date().toISOString(),
          transient: true,
        }),
      );
    } catch {
      // Best-effort flagging
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

// Re-export from existing validation module for convenience
export { validateDealsBatch, deactivateInvalidDeals } from "./validation";
