import type { Env } from "../types";
import { jsonResponse, errorResponse } from "./utils";
import { logger } from "../lib/global-logger";

export interface DashboardStats {
  stats: {
    total: number;
    active: number;
    quarantined: number;
    rejected: number;
  };
  recentActivity: {
    runs: number;
    dealsFound: number;
    errors: number;
  };
  systemHealth: {
    status: "healthy" | "degraded" | "unhealthy";
    checks: Record<string, boolean>;
  };
  timestamp: string;
}

export async function getDashboardStats(env: Env): Promise<DashboardStats> {
  try {
    const [dealsStats, activity, health] = await Promise.all([
      getDealsStats(env),
      getRecentActivity(env),
      getSystemHealth(env),
    ]);
    return {
      stats: dealsStats,
      recentActivity: activity,
      systemHealth: health,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.warn("dashboard: getDashboardStats failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      stats: { total: 0, active: 0, quarantined: 0, rejected: 0 },
      recentActivity: { runs: 0, dealsFound: 0, errors: 0 },
      systemHealth: { status: "degraded", checks: {} },
      timestamp: new Date().toISOString(),
    };
  }
}

export async function handleDashboardStats(
  env: Env,
  request?: Request,
): Promise<Response> {
  try {
    const stats = await getDashboardStats(env);
    return jsonResponse(stats, 200, request, env);
  } catch (error) {
    logger.warn("dashboard: handleDashboardStats failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      "Failed to get dashboard stats",
      500,
      undefined,
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
    const activity = await getRecentActivity(env);
    return jsonResponse(activity, 200, request, env);
  } catch (error) {
    logger.warn("dashboard: handleDashboardRecentActivity failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      "Failed to get recent activity",
      500,
      undefined,
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
    const health = await getSystemHealth(env);
    return jsonResponse(health, 200, request, env);
  } catch (error) {
    logger.warn("dashboard: handleDashboardHealth failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      "Failed to get system health",
      500,
      undefined,
      request,
      env,
    );
  }
}

async function getDealsStats(env: Env): Promise<{
  total: number;
  active: number;
  quarantined: number;
  rejected: number;
}> {
  try {
    const result = await env.DEALS_DB.prepare(
      "SELECT COUNT(*) as count, status FROM deals GROUP BY status",
    ).all();
    const stats: Record<string, number> = {};
    for (const row of result.results as Array<{
      status: string;
      count: number;
    }>) {
      stats[row.status] = row.count;
    }
    return {
      total:
        (stats.active || 0) + (stats.quarantined || 0) + (stats.rejected || 0),
      active: stats.active || 0,
      quarantined: stats.quarantined || 0,
      rejected: stats.rejected || 0,
    };
  } catch (error) {
    logger.warn("dashboard: handleDashboardAlerts failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { total: 0, active: 0, quarantined: 0, rejected: 0 };
  }
}

async function getRecentActivity(env: Env): Promise<{
  runs: number;
  dealsFound: number;
  errors: number;
}> {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = await env.DEALS_LOG.list();
    const logs = result.keys
      .map((k) => JSON.parse(k.metadata as string))
      .filter((l: { ts?: string }) => l.ts && l.ts >= twentyFourHoursAgo);
    const runs = logs.filter(
      (l: { phase?: string }) => l.phase === "finalize",
    ).length;
    const errors = logs.filter(
      (l: { status?: string }) => l.status === "error",
    ).length;
    const dealsFound = logs.reduce(
      (sum: number, l: { candidate_count?: number }) =>
        sum + (l.candidate_count || 0),
      0,
    );
    return { runs, dealsFound, errors };
  } catch (error) {
    logger.warn("dashboard: handleDashboardPerformance failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { runs: 0, dealsFound: 0, errors: 0 };
  }
}

async function getSystemHealth(env: Env): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, boolean>;
}> {
  const checks: Record<string, boolean> = {};
  const kvKeys = [
    "DEALS_PROD",
    "DEALS_STAGING",
    "DEALS_LOG",
    "DEALS_LOCK",
    "DEALS_SOURCES",
  ];
  const envKeys = [
    "DEALS_PROD",
    "DEALS_STAGING",
    "DEALS_LOG",
    "DEALS_LOCK",
    "DEALS_SOURCES",
  ];
  for (let i = 0; i < kvKeys.length; i++) {
    const kvKey = kvKeys[i];
    const envKey = envKeys[i];
    if (kvKey === undefined || envKey === undefined) continue;
    try {
      const ns = env[envKey as keyof Env] as unknown;
      checks[kvKey] = !!(
        ns &&
        typeof ns === "object" &&
        "get" in (ns as Record<string, unknown>)
      );
    } catch (error) {
      logger.warn("dashboard: handleDashboardExport failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      checks[kvKey] = false;
    }
  }
  try {
    await env.DEALS_DB.prepare("SELECT 1").first();
    checks.d1_connection = true;
  } catch (error) {
    logger.warn("dashboard: handleDashboardConfig failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    checks.d1_connection = false;
  }
  const allPassed = Object.values(checks).every((v) => v === true);
  return { status: allPassed ? "healthy" : "degraded", checks };
}

export async function getDashboardData(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const stats = await getDashboardStats(env);
    return jsonResponse(stats, 200, request, env);
  } catch (error) {
    logger.warn("dashboard: handleDashboardNotifications failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      "Failed to get dashboard data",
      500,
      undefined,
      request,
      env,
    );
  }
}
