import type { Deal, LogEntry } from "../../types";

// ============================================================================
// Analytics Types
// ============================================================================

export interface DealAnalytics {
  // Deal volume trends
  dealsOverTime: {
    date: string;
    discovered: number;
    published: number;
    expired: number;
  }[];

  // Category distribution
  categoryBreakdown: {
    category: string;
    count: number;
    avgConfidence: number;
    avgValue: number;
  }[];

  // Source performance
  sourcePerformance: {
    domain: string;
    dealsDiscovered: number;
    dealsPublished: number;
    avgConfidence: number;
    trustScore: number;
  }[];

  // Value distribution
  valueDistribution: {
    range: string;
    count: number;
    percentage: number;
  }[];

  // Expiry forecast
  expiringSoon: {
    next7Days: number;
    next30Days: number;
    next90Days: number;
  };

  // Quality metrics
  qualityMetrics: {
    avgConfidence: number;
    validationSuccessRate: number;
    quarantineRate: number;
  };
}

export interface AnalyticsSummary {
  totalActiveDeals: number;
  totalDealsDiscovered: number;
  totalDealsPublished: number;
  avgDealsPerDay: number;
  topCategory: string;
  topSource: string;
  expiringNext7Days: number;
  lastUpdated: string;
}

export interface ReferralAnalytics {
  periodDays: number;
  generatedAt: string;
  perSourceSuccessRate: Array<{
    source: string;
    domain: string;
    total: number;
    active: number;
    quarantined: number;
    successRate: number;
    avgConfidence: number;
    trustScore: number | null;
  }>;
  rewardTotals: {
    totalDeals: number;
    totalValue: number;
    avgValue: number;
    currency: string;
    byType: Array<{
      type: string;
      count: number;
      totalValue: number;
      avgValue: number;
    }>;
    byCurrency: Array<{ currency: string; count: number; totalValue: number }>;
  };
  conversionByDomain: Array<{
    domain: string;
    deals: number;
    referrals: number;
    totalUses: number;
    uniqueUsers: number;
    conversionRate: number;
  }>;
  timeToExpiry: {
    avgDaysToExpiry: number | null;
    expiringIn7Days: number;
    expiringIn30Days: number;
    expiringIn90Days: number;
    alreadyExpired: number;
    noExpiry: number;
    buckets: Array<{ bucket: string; count: number }>;
  };
  systemMetrics: Array<{ metric: string; avgValue: number; count: number }>;
}
