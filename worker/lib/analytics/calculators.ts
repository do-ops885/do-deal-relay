import type { Deal, LogEntry } from "../../types";
import type { DealAnalytics } from "./types";
import { getRecentMetrics } from "../metrics";

// ============================================================================
// Individual Analytics Calculators
// ============================================================================

export function calculateDealsOverTime(
  deals: Deal[],
  logs: LogEntry[],
  days: number,
): DealAnalytics["dealsOverTime"] {
  const result: DealAnalytics["dealsOverTime"] = [];
  const now = new Date();

  // Create date buckets for the lookback period
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    // Count deals discovered on this date (from logs)
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const discovered = logs.filter((log) => {
      const logDate = new Date(log.ts);
      return (
        logDate >= dayStart &&
        logDate <= dayEnd &&
        log.phase === "discover" &&
        log.candidate_count
      );
    }).length;

    // Count deals published on this date
    const published = logs.filter((log) => {
      const logDate = new Date(log.ts);
      return (
        logDate >= dayStart &&
        logDate <= dayEnd &&
        log.phase === "publish" &&
        log.status === "complete"
      );
    }).length;

    // Count deals that expired on this date
    const expired = deals.filter((deal) => {
      if (!deal.expiry.date) return false;
      const expiryDate = new Date(deal.expiry.date);
      return (
        expiryDate >= dayStart &&
        expiryDate <= dayEnd &&
        deal.metadata.status !== "active"
      );
    }).length;

    result.push({
      date: dateStr,
      discovered,
      published,
      expired,
    });
  }

  return result;
}

export function calculateCategoryBreakdown(
  deals: Deal[],
): DealAnalytics["categoryBreakdown"] {
  const categoryStats = new Map<
    string,
    {
      count: number;
      confidenceSum: number;
      valueSum: number;
    }
  >();

  deals.forEach((deal) => {
    deal.metadata.category.forEach((category) => {
      const stats = categoryStats.get(category) || {
        count: 0,
        confidenceSum: 0,
        valueSum: 0,
      };

      stats.count++;
      stats.confidenceSum += deal.metadata.confidence_score;

      // Add value if numeric
      if (typeof deal.reward.value === "number") {
        stats.valueSum += deal.reward.value;
      }

      categoryStats.set(category, stats);
    });
  });

  return Array.from(categoryStats.entries()).map(([category, stats]) => ({
    category,
    count: stats.count,
    avgConfidence: Math.round((stats.confidenceSum / stats.count) * 100) / 100,
    avgValue:
      stats.count > 0
        ? Math.round((stats.valueSum / stats.count) * 100) / 100
        : 0,
  }));
}

export function calculateSourcePerformance(
  deals: Deal[],
  sourceRegistry: Array<{ domain: string; trust_initial: number }>,
): DealAnalytics["sourcePerformance"] {
  const sourceStats = new Map<
    string,
    {
      dealsDiscovered: number;
      dealsPublished: number;
      confidenceSum: number;
    }
  >();

  // Count deals per source
  deals.forEach((deal) => {
    const domain = deal.source.domain;
    const stats = sourceStats.get(domain) || {
      dealsDiscovered: 0,
      dealsPublished: 0,
      confidenceSum: 0,
    };

    stats.dealsDiscovered++;
    stats.confidenceSum += deal.metadata.confidence_score;

    if (deal.metadata.status === "active") {
      stats.dealsPublished++;
    }

    sourceStats.set(domain, stats);
  });

  // Merge with registry data for trust scores
  return Array.from(sourceStats.entries()).map(([domain, stats]) => {
    const registrySource = sourceRegistry.find((s) => s.domain === domain);
    const trustScore = registrySource?.trust_initial || 0.5;

    return {
      domain,
      dealsDiscovered: stats.dealsDiscovered,
      dealsPublished: stats.dealsPublished,
      avgConfidence:
        Math.round((stats.confidenceSum / stats.dealsDiscovered) * 100) / 100,
      trustScore,
    };
  });
}

export function calculateValueDistribution(
  deals: Deal[],
): DealAnalytics["valueDistribution"] {
  const ranges = [
    { min: 0, max: 50, label: "0-50" },
    { min: 50, max: 100, label: "50-100" },
    { min: 100, max: 500, label: "100-500" },
    { min: 500, max: Infinity, label: "500+" },
  ];

  const rangeCounts = new Map<string, number>();

  deals.forEach((deal) => {
    const value = deal.reward.value;
    if (typeof value === "number") {
      const range = ranges.find((r) => value >= r.min && value < r.max);
      if (range) {
        rangeCounts.set(range.label, (rangeCounts.get(range.label) || 0) + 1);
      }
    }
  });

  const total = deals.filter((d) => typeof d.reward.value === "number").length;

  return ranges.map((range) => {
    const count = rangeCounts.get(range.label) || 0;
    return {
      range: range.label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  });
}

export function calculateExpiringSoon(
  deals: Deal[],
): DealAnalytics["expiringSoon"] {
  const now = new Date();

  const next7Days = new Date(now);
  next7Days.setDate(next7Days.getDate() + 7);

  const next30Days = new Date(now);
  next30Days.setDate(next30Days.getDate() + 30);

  const next90Days = new Date(now);
  next90Days.setDate(next90Days.getDate() + 90);

  let expiring7Days = 0;
  let expiring30Days = 0;
  let expiring90Days = 0;

  deals.forEach((deal) => {
    if (!deal.expiry.date) return;

    const expiryDate = new Date(deal.expiry.date);

    if (expiryDate >= now && expiryDate <= next7Days) {
      expiring7Days++;
    }
    if (expiryDate >= now && expiryDate <= next30Days) {
      expiring30Days++;
    }
    if (expiryDate >= now && expiryDate <= next90Days) {
      expiring90Days++;
    }
  });

  return {
    next7Days: expiring7Days,
    next30Days: expiring30Days,
    next90Days: expiring90Days,
  };
}

export function calculateQualityMetrics(
  deals: Deal[],
  logs: LogEntry[],
  metrics: Awaited<ReturnType<typeof getRecentMetrics>>,
): DealAnalytics["qualityMetrics"] {
  // Calculate average confidence
  const avgConfidence =
    deals.length > 0
      ? Math.round(
          (deals.reduce((sum, d) => sum + d.metadata.confidence_score, 0) /
            deals.length) *
            100,
        ) / 100
      : 0;

  // Calculate validation success rate from recent logs
  const validationLogs = logs.filter(
    (log) => log.phase === "validate" && log.candidate_count !== undefined,
  );

  const totalCandidates = validationLogs.reduce(
    (sum, log) => sum + (log.candidate_count || 0),
    0,
  );
  const totalValid = validationLogs.reduce(
    (sum, log) => sum + (log.valid_count || 0),
    0,
  );

  const validationSuccessRate =
    totalCandidates > 0
      ? Math.round((totalValid / totalCandidates) * 1000) / 10
      : 100;

  // Calculate quarantine rate
  const quarantined = deals.filter(
    (d) => d.metadata.status === "quarantined",
  ).length;
  const quarantineRate =
    deals.length > 0 ? Math.round((quarantined / deals.length) * 1000) / 10 : 0;

  return {
    avgConfidence,
    validationSuccessRate,
    quarantineRate,
  };
}
