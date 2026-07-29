/**
 * D1 Database Module
 * Export all D1-related functionality
 */

// Client
export {
  D1Client,
  createD1Client,
  createD1ReadClient,
  createD1WriteClient,
  type D1ClientConfig,
  type QueryResult,
  type SingleResult,
} from "./client";

// Migrations
export {
  MigrationRunner,
  createMigrationRunner,
  initDatabase,
  getMigrationStatus,
  type Migration,
  type MigrationResult,
  type MigrationStatus,
} from "./migrations";

// Queries
export {
  // Full-text search
  searchDeals,
  getSearchSuggestions,
  // Domain and category queries
  getDealsByDomain,
  getDealsByCategory,
  getDomainsWithCounts,
  getCategoriesWithCounts,
  // Status-based queries
  getActiveDeals,
  getExpiringDeals,
  getRecentDeals,
  // Statistics
  getDealStats,
  getDealTimeSeries,
  // Insert/Update
  insertDeal,
  insertReferralCode,
  // Referral code queries
  getReferralCodesByDeal,
  getReferralCodeByString,
  // Analytics
  getTopDomains,
  getReferralUsageStats,
  // Types
  type DealSearchResult,
  type DealStats,
  type ExpiringDealRow,
  type ReferralCodeResult,
} from "./queries";

// Trust score mutations
export {
  evolveTrust,
  evolveTrustBatch,
  getTrustScore,
  getTrustScores,
  getTopTrustedDomains,
  getDomainsNeedingReview,
  type TrustScoreRow,
  type TrustEvolutionResult,
} from "./trust";

// Batch operations
export {
  logAuditEvent,
  logAuditEventsBatch,
  type AuditEvent,
} from "./audit-log";

export { insertReferralsBatch, type ReferralRecord } from "./referrals-batch";

export {
  writeMetric,
  writeMetricsBatch,
  type MetricType,
  type SystemMetric,
} from "./system-metrics";

export {
  getResearchCacheBatch,
  putResearchCacheBatch,
  getResearchCache,
  putResearchCache,
} from "./research-cache";

// Re-export SQL schema for reference
export const SCHEMA_VERSION = "1.0.0";
