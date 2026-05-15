import type { Deal, Env, LogEntry } from "../../types";
import { getProductionSnapshot, getSourceRegistry } from "../storage";
import { getRecentLogs } from "../logger";
import { getRecentMetrics } from "../metrics/index";
import type { DealAnalytics, AnalyticsSummary } from "./types";
import {
  calculateDealsOverTime,
  calculateCategoryBreakdown,
  calculateSourcePerformance,
  calculateValueDistribution,
  calculateExpiringSoon,
  calculateQualityMetrics,
} from "./calculators";
import { generateDashboardHTML } from "./dashboard";

// Re-export types
export type { DealAnalytics, AnalyticsSummary } from "./types";

// ============================================================================
// Main Analytics Generator
// ============================================================================

export async function generateDealAnalytics(
  env: Env,
  days: number = 30,
): Promise<DealAnalytics> {
  const [snapshot, sourceRegistry, logs, metrics] = await Promise.all([
    getProductionSnapshot(env),
    getSourceRegistry(env),
    getRecentLogs(env, 1000),
    getRecentMetrics(env, 100),
  ]);

  const deals = snapshot?.deals || [];

  return {
    dealsOverTime: calculateDealsOverTime(deals, logs, days),
    categoryBreakdown: calculateCategoryBreakdown(deals),
    sourcePerformance: calculateSourcePerformance(deals, sourceRegistry),
    valueDistribution: calculateValueDistribution(deals),
    expiringSoon: calculateExpiringSoon(deals),
    qualityMetrics: calculateQualityMetrics(deals, logs, metrics),
  };
}

export async function generateAnalyticsSummary(
  env: Env,
  days: number = 30,
): Promise<AnalyticsSummary> {
  const [snapshot, logs] = await Promise.all([
    getProductionSnapshot(env),
    getRecentLogs(env, 1000),
  ]);

  const deals = snapshot?.deals || [];
  const activeDeals = deals.filter((d) => d.metadata.status === "active");

  // Calculate totals from logs
  const recentLogs = logs.filter((log) => {
    const logDate = new Date(log.ts);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return logDate >= cutoffDate;
  });

  const discovered = recentLogs.reduce(
    (sum, log) => sum + (log.candidate_count || 0),
    0,
  );
  const published = recentLogs.reduce(
    (sum, log) => sum + (log.valid_count || 0),
    0,
  );

  // Find top category
  const categoryCounts = new Map<string, number>();
  activeDeals.forEach((deal) => {
    deal.metadata.category.forEach((cat) => {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    });
  });
  const topCategory =
    Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "N/A";

  // Find top source
  const sourceCounts = new Map<string, number>();
  activeDeals.forEach((deal) => {
    sourceCounts.set(
      deal.source.domain,
      (sourceCounts.get(deal.source.domain) || 0) + 1,
    );
  });
  const topSource =
    Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "N/A";

  // Count expiring in next 7 days
  const now = new Date();
  const next7Days = new Date(now);
  next7Days.setDate(next7Days.getDate() + 7);

  const expiringNext7Days = activeDeals.filter((deal) => {
    if (!deal.expiry.date) return false;
    const expiryDate = new Date(deal.expiry.date);
    return expiryDate <= next7Days && expiryDate >= now;
  }).length;

  return {
    totalActiveDeals: activeDeals.length,
    totalDealsDiscovered: discovered,
    totalDealsPublished: published,
    avgDealsPerDay: Math.round((discovered / days) * 100) / 100,
    topCategory,
    topSource,
    expiringNext7Days,
    lastUpdated: snapshot?.generated_at || new Date().toISOString(),
  };
}

// Re-export dashboard generator
export { generateDashboardHTML } from "./dashboard";
