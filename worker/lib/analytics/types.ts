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
