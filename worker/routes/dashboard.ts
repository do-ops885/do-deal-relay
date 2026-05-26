import type { Env, DashboardStats } from "../types";
import { handleError } from "../lib/error-handler";
import { jsonResponse } from "./utils";

export async function getDashboardStats(env: Env): Promise<DashboardStats> {
  try {
    const [dealsStats, activity, health] = await Promise.all([getDealsStats(env), getRecentActivity(env), getSystemHealth(env)]);
    return { stats: dealsStats, recentActivity: activity, systemHealth: health, timestamp: new Date().toISOString() };
  } catch (error) {
    return { stats: { total: 0, active: 0, quarantined: 0, rejected: 0 }, recentActivity: { runs: 0, dealsFound: 0, errors: 0 }, systemHealth: { status: "degraded", checks: {} }, timestamp: new Date().toISOString() };
  }
}

async function getDealsStats(env: Env): Promise<{ total: number; active: number; quarantined: number; rejected: number; }> {
  try {
    const result = await env.DEALS_DB.prepare("SELECT COUNT(*) as count, status FROM deals GROUP BY status").all();
    const stats: Record<string, number> = {};
    for (const row of result.results as Array<{ status: string; count: number }>) stats[row.status] = row.count;
    return { total: (stats.active || 0) + (stats.quarantined || 0) + (stats.rejected || 0), active: stats.active || 0, quarantined: stats.quarantined || 0, rejected: stats.rejected || 0 };
  } catch { return { total: 0, active: 0, quarantined: 0, rejected: 0 }; }
}

async function getRecentActivity(env: Env): Promise<{ runs: number; dealsFound: number; errors: number; }> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await env.DEALS_LOG.list();
    const logs = result.keys.map((k) => JSON.parse(k.metadata as string)).filter((l: { ts?: string }) => l.ts && l.ts >= twentyFourHoursAgo);
    const runs = logs.filter((l: { phase?: string }) => l.phase === "finalize").length;
    const errors = logs.filter((l: { status?: string }) => l.status === "error").length;
    const dealsFound = logs.reduce((sum: number, l: { candidate_count?: number }) => sum + (l.candidate_count || 0), 0);
    return { runs, dealsFound, errors };
  } catch { return { runs: 0, dealsFound: 0, errors: 0 }; }
}

async function getSystemHealth(env: Env): Promise<{ status: "healthy" | "degraded" | "unhealthy"; checks: Record<string, boolean>; }> {
  const checks: Record<string, boolean> = {};
  const kvKeys = ["DEALS_PROD", "DEALS_STAGING", "DEALS_LOG", "DEALS_LOCK", "DEALS_SOURCES"];
  const envKeys = ["DEALS_PROD", "DEALS_STAGING", "DEALS_LOG", "DEALS_LOCK", "DEALS_SOURCES"];
  for (let i = 0; i < kvKeys.length; i++) {
    const kvKey = kvKeys[i];
    const envKey = envKeys[i];
    try {
      const ns = env[envKey as keyof Env] as unknown;
      checks[kvKey] = !!(ns && typeof ns === "object" && "get" in (ns as Record<string, unknown>));
    } catch { checks[kvKey] = false; }
  }
  try { await env.DEALS_DB.prepare("SELECT 1").first(); checks.d1_connection = true; } catch { checks.d1_connection = false; }
  const allPassed = Object.values(checks).every((v) => v === true);
  return { status: allPassed ? "healthy" : "degraded", checks };
}

export async function getDashboardData(request: Request, env: Env): Promise<Response> {
  try { const stats = await getDashboardStats(env); return jsonResponse(stats, 200, request, env); } catch (error) { return handleError(error, request, env, "Failed to get dashboard data"); }
}