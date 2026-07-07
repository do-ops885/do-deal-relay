import { Deal, Env } from "../../types";
import { getProductionSnapshot } from "../../lib/storage";
import { logger } from "../../lib/global-logger";
import { notify } from "../../notify";
import { fetchInBatches, createTimeoutSignal } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface CVCheckResult {
  link: boolean;
  reward: boolean;
  domain: boolean;
}

export interface CVResult {
  dealId: string;
  healthy: boolean;
  checks: CVCheckResult;
  timestamp: string;
  error?: string;
}

export interface CVSummary {
  totalChecked: number;
  healthy: number;
  unhealthy: number;
  results: CVResult[];
  timestamp: string;
}

interface CVStoredStatus {
  dealId: string;
  healthy: boolean;
  checks: CVCheckResult;
  timestamp: string;
  previousTimestamp?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CV_STATUS_PREFIX = "cv:status:";
const CV_TTL_SECONDS = 7 * 24 * 60 * 60;
const CV_WINDOW_HOURS = 72;
const CV_HEAD_TIMEOUT_MS = 10_000;
const CV_DNS_TIMEOUT_MS = 5_000;
const CV_MAX_CONCURRENT = 10;

// ============================================================================
// Individual Checks
// ============================================================================

async function checkLinkLiveness(url: string): Promise<boolean> {
  try {
    const { signal, cleanup } = createTimeoutSignal(CV_HEAD_TIMEOUT_MS);
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal,
    });
    cleanup();
    return response.ok;
  } catch {
    return false;
  }
}

async function checkRewardAccuracy(deal: Deal): Promise<boolean> {
  if (typeof deal.reward.value === "number") {
    if (deal.reward.value < 0) return false;
    if (deal.reward.value > 10_000) return false;
  }

  if (deal.reward.type === "percent" && typeof deal.reward.value === "number") {
    return deal.reward.value >= 0 && deal.reward.value <= 100;
  }

  return true;
}

async function checkDomainHealth(domain: string): Promise<boolean> {
  try {
    const { signal, cleanup } = createTimeoutSignal(CV_DNS_TIMEOUT_MS);
    const response = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal,
      redirect: "follow",
    });
    cleanup();
    return response.status < 500;
  } catch {
    return false;
  }
}

// ============================================================================
// KV Helpers
// ============================================================================

function cvKey(dealId: string): string {
  return `${CV_STATUS_PREFIX}${dealId}`;
}

async function getStoredCVStatus(
  env: Env,
  dealId: string,
): Promise<CVStoredStatus | null> {
  return env.DEALS_LOG.get<CVStoredStatus>(cvKey(dealId), "json");
}

async function storeCVStatus(env: Env, status: CVStoredStatus): Promise<void> {
  await env.DEALS_LOG.put(cvKey(status.dealId), JSON.stringify(status), {
    expirationTtl: CV_TTL_SECONDS,
  });
}

// ============================================================================
// Public API
// ============================================================================

export async function verifyDealHealth(
  deal: Deal,
  env: Env,
): Promise<CVResult> {
  const [link, reward, domain] = await Promise.all([
    checkLinkLiveness(deal.url),
    checkRewardAccuracy(deal),
    checkDomainHealth(deal.source.domain),
  ]);

  const healthy = link && reward && domain;
  const result: CVResult = {
    dealId: deal.id,
    healthy,
    checks: { link, reward, domain },
    timestamp: new Date().toISOString(),
  };

  const previous = await getStoredCVStatus(env, deal.id);
  await storeCVStatus(env, {
    dealId: deal.id,
    healthy,
    checks: { link, reward, domain },
    timestamp: result.timestamp,
    previousTimestamp: previous?.timestamp,
  });

  if (!healthy && previous?.healthy !== false) {
    const failedChecks = Object.entries({ link, reward, domain })
      .filter(([, v]) => !v)
      .map(([k]) => k);

    await notify(env, {
      type: "checks_failed",
      severity: "warning",
      run_id: `cv-${Date.now()}`,
      message: `Deal ${deal.code} failed continuous verification: ${failedChecks.join(", ")}`,
      context: {
        dealId: deal.id,
        code: deal.code,
        domain: deal.source.domain,
        failedChecks,
        url: deal.url,
      },
    });
  }

  return result;
}

export async function runContinuousVerification(env: Env): Promise<CVSummary> {
  logger.info("Starting continuous verification", {
    component: "continuous-verification",
  });

  const snapshot = await getProductionSnapshot(env);
  if (!snapshot) {
    logger.warn("No production snapshot found for CV", {
      component: "continuous-verification",
    });
    return {
      totalChecked: 0,
      healthy: 0,
      unhealthy: 0,
      results: [],
      timestamp: new Date().toISOString(),
    };
  }

  const cutoff = Date.now() - CV_WINDOW_HOURS * 60 * 60 * 1000;
  const recentDeals = snapshot.deals.filter((deal) => {
    if (deal.metadata.status !== "active") return false;
    const normalizedAt = new Date(deal.metadata.normalized_at).getTime();
    return normalizedAt >= cutoff;
  });

  logger.info(`Checking ${recentDeals.length} recent deals`, {
    component: "continuous-verification",
    total: snapshot.deals.length,
    windowHours: CV_WINDOW_HOURS,
  });

  const results = await fetchInBatches(
    recentDeals,
    (deal) => verifyDealHealth(deal, env),
    CV_MAX_CONCURRENT,
  );

  const healthy = results.filter((r) => r.healthy).length;
  const unhealthy = results.length - healthy;

  const summary: CVSummary = {
    totalChecked: results.length,
    healthy,
    unhealthy,
    results,
    timestamp: new Date().toISOString(),
  };

  if (unhealthy > 0) {
    const unhealthyDeals = results
      .filter((r) => !r.healthy)
      .map((r) => {
        const deal = recentDeals.find((d) => d.id === r.dealId);
        return {
          dealId: r.dealId,
          code: deal?.code ?? "unknown",
          domain: deal?.source.domain ?? "unknown",
          failedChecks: Object.entries(r.checks)
            .filter(([, v]) => !v)
            .map(([k]) => k),
        };
      });

    await notify(env, {
      type: "checks_failed",
      severity: unhealthy > 5 ? "critical" : "warning",
      run_id: `cv-batch-${Date.now()}`,
      message: `Continuous verification: ${unhealthy}/${results.length} deals unhealthy`,
      context: {
        totalChecked: results.length,
        healthy,
        unhealthy,
        unhealthyDeals,
      },
    });
  }

  logger.info("Continuous verification completed", {
    component: "continuous-verification",
    totalChecked: results.length,
    healthy,
    unhealthy,
  });

  return summary;
}
