import { handleError } from "../lib/error-handler";
import { jsonResponse } from "./utils";
import { CONFIG } from "../config";
import type { Env } from "../types";
import { getProductionSnapshot } from "../lib/storage";
import { getPipelineStatus } from "../state-machine";
import { getRecentLogs } from "../lib/logger";
import type { LogEntry } from "../types";
import { getDealStats, getTopDomains, getRecentDeals } from "../lib/d1/queries";

const START_TIME = Date.now();

interface DashboardStats {
  deals: {
    total: number;
    active: number;
    quarantined: number;
    rejected: number;
    expired: number;
    added_last_7d: number;
  };
  referrals: {
    total: number;
    active: number;
  };
  top_domains: Array<{ domain: string; deals: number; referrals: number }>;
  reward_types: Array<{ type: string; count: number }>;
}

interface DashboardActivity {
  id: string;
  type: "deal_added" | "pipeline_run" | "validation" | "referral_created";
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface DashboardSystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime_seconds: number;
  environment: string;
  d1: {
    connected: boolean;
  };
  kv: {
    deals_prod: boolean;
    deals_staging: boolean;
    deals_log: boolean;
    deals_lock: boolean;
    deals_sources: boolean;
  };
  pipeline: {
    locked: boolean;
    last_run: string | null;
  };
  last_snapshot: {
    total_deals: number;
    generated_at: string | null;
  } | null;
}

export async function handleDashboardStats(
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    const [statsResult, topDomainsResult, snapshotResult] =
      await Promise.allSettled([
        env.DEALS_DB ? getDealStats(env.DEALS_DB) : Promise.resolve(null),
        env.DEALS_DB ? getTopDomains(env.DEALS_DB, 10) : Promise.resolve([]),
        getProductionSnapshot(env),
      ]);

    const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
    const topDomains =
      topDomainsResult.status === "fulfilled" ? topDomainsResult.value : [];
    const snapshot =
      snapshotResult.status === "fulfilled" ? snapshotResult.value : null;

    let recentDealCount = 0;
    if (env.DEALS_DB) {
      try {
        const recent = await getRecentDeals(env.DEALS_DB, 7, 1000);
        recentDealCount = recent.length;
      } catch {
        recentDealCount = 0;
      }
    }

    let totalReferrals = 0;
    let activeReferrals = 0;
    if (snapshot?.deals) {
      totalReferrals = snapshot.deals.length;
      activeReferrals = snapshot.deals.filter(
        (d) => d.metadata.status === "active",
      ).length;
    }

    const result: DashboardStats = {
      deals: {
        total: stats?.total || snapshot?.stats.total || 0,
        active: stats?.active || snapshot?.stats.active || 0,
        quarantined: stats?.quarantined || snapshot?.stats.quarantined || 0,
        rejected: stats?.rejected || snapshot?.stats.rejected || 0,
        expired: stats?.expired || 0,
        added_last_7d: recentDealCount,
      },
      referrals: {
        total: totalReferrals,
        active: activeReferrals,
      },
      top_domains:
        topDomains.length > 0
          ? topDomains
          : (stats?.byDomain || []).map((d) => ({
              domain: d.domain,
              deals: d.count,
              referrals: 0,
            })),
      reward_types: stats?.byRewardType || [],
    };

    return jsonResponse(result, 200, request, env);
  } catch (error) {
    const err = handleError(error, {
      component: "dashboard",
      handler: "handleDashboardStats",
    });
    return jsonResponse(
      { error: "Failed to retrieve dashboard stats", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleDashboardRecentActivity(
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    const url = new URL(request?.url || "http://localhost");
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10),
      100,
    );

    const [logsResult, recentDealsResult] = await Promise.allSettled([
      getRecentLogs(env, limit),
      env.DEALS_DB
        ? getRecentDeals(env.DEALS_DB, 7, limit)
        : Promise.resolve([]),
    ]);

    const logs =
      logsResult.status === "fulfilled" ? (logsResult.value as LogEntry[]) : [];
    const recentDeals =
      recentDealsResult.status === "fulfilled" ? recentDealsResult.value : [];

    const activity: DashboardActivity[] = [];

    for (const deal of recentDeals) {
      activity.push({
        id: `deal-${deal.deal_id}`,
        type: "deal_added",
        description: `Deal added: ${deal.title} (${deal.domain})`,
        timestamp: new Date().toISOString(),
        metadata: {
          deal_id: deal.deal_id,
          domain: deal.domain,
          code: deal.code,
          reward: `${deal.reward_value} ${deal.reward_currency}`,
        },
      });
    }

    for (const log of logs) {
      activity.push({
        id: `pipeline-${log.run_id}-${log.ts}`,
        type: "pipeline_run",
        description: `Pipeline ${log.phase}: ${log.status}${log.candidate_count ? ` (${log.candidate_count} candidates)` : ""}`,
        timestamp: log.ts,
        metadata: {
          run_id: log.run_id,
          phase: log.phase,
          status: log.status,
          candidate_count: log.candidate_count,
          valid_count: log.valid_count,
          duration_ms: log.duration_ms,
        },
      });
    }

    activity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const limited = activity.slice(0, limit);

    return jsonResponse(
      { activity: limited, total: limited.length },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "dashboard",
      handler: "handleDashboardRecentActivity",
    });
    return jsonResponse(
      { error: "Failed to retrieve recent activity", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleDashboardSystemHealth(
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    let d1Connected = false;
    if (env.DEALS_DB) {
      try {
        const result = await env.DEALS_DB.prepare("SELECT 1 as test").first<{
          test: number;
        }>();
        d1Connected = result?.test === 1;
      } catch {
        d1Connected = false;
      }
    }

    const kvChecks = {
      deals_prod: false,
      deals_staging: false,
      deals_log: false,
      deals_lock: false,
      deals_sources: false,
    };

    const kvKeys: Array<keyof typeof kvChecks> = [
      "deals_prod",
      "deals_staging",
      "deals_log",
      "deals_lock",
      "deals_sources",
    ];
    const envKeys: Array<keyof Env> = [
      "DEALS_PROD",
      "DEALS_STAGING",
      "DEALS_LOG",
      "DEALS_LOCK",
      "DEALS_SOURCES",
    ];

    for (let i = 0; i < kvKeys.length; i++) {
      const envKey = envKeys[i];
      if (!envKey) continue;
      const kvKey = kvKeys[i];
      if (!kvKey) continue;
      try {
        const ns = env[envKey] as unknown;
        kvChecks[kvKey] = !!(
          ns &&
          typeof ns === "object" &&
          "get" in (ns as Record<string, unknown>)
        );
      } catch {
        kvChecks[kvKey] = false;
      }
    }

    const [snapshotResult, pipelineResult] = await Promise.allSettled([
      getProductionSnapshot(env),
      getPipelineStatus(env),
    ]);

    const snapshot =
      snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
    const pipeline =
      pipelineResult.status === "fulfilled" ? pipelineResult.value : null;

    const allKvHealthy = Object.values(kvChecks).every(Boolean);
    const status = allKvHealthy && d1Connected ? "healthy" : "degraded";

    const result: DashboardSystemHealth = {
      status,
      version: CONFIG.VERSION,
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
      environment: env.ENVIRONMENT || "unknown",
      d1: { connected: d1Connected },
      kv: kvChecks,
      pipeline: {
        locked: pipeline?.locked || false,
        last_run: pipeline?.last_run?.timestamp || null,
      },
      last_snapshot: snapshot
        ? {
            total_deals: snapshot.stats.total,
            generated_at: snapshot.generated_at,
          }
        : null,
    };

    return jsonResponse(result, 200, request, env);
  } catch (error) {
    const err = handleError(error, {
      component: "dashboard",
      handler: "handleDashboardSystemHealth",
    });
    return jsonResponse(
      { error: "Failed to retrieve system health", message: err.message },
      500,
      request,
      env,
    );
  }
}
