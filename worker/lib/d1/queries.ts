/**
 * Common D1 Query Patterns for Deal Discovery
 * Full-text search, filtering, and analytics queries
 */

export type {
  DealSearchResult,
  DealStats,
  ExpiringDealRow,
  ReferralCodeResult,
} from "./types";

export { searchDeals, getSearchSuggestions } from "./search";

export {
  getDealsByDomain,
  getDealsByCategory,
  getDomainsWithCounts,
  getCategoriesWithCounts,
} from "./domain-category";

export { getActiveDeals, getExpiringDeals, getRecentDeals } from "./status";

export { getDealStats, getDealTimeSeries } from "./statistics";

export { insertDeal, insertReferralCode } from "./mutations";

export { getReferralCodesByDeal, getReferralCodeByString } from "./referrals";

export {
  getTopDomains,
  getReferralUsageStats,
  getSimilarDealsD1,
  getRecommendedDealsD1,
  getTrendingDealsD1,
} from "./analytics";
