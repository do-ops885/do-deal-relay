/**
 * Reward Scraper Module
 *
 * Re-scrapes deal pages to detect reward changes and validate current offers.
 * Compares current rewards with stored deals to identify discrepancies.
 */

export type {
  RewardScrapeResult,
  RewardChange,
  ExtractedReward,
} from "./scrapers/types";

export { extractRewardFromHTML } from "./scrapers/html-extractor";

export {
  scrapeCurrentRewards,
  extractDomain,
} from "./scrapers/reward-scraper-core";

export {
  detectRewardChanges,
  compareRewards,
} from "./scrapers/change-detector";

export {
  batchScrapeRewards,
  getDealsWithRewardChanges,
  getScrapingStats,
} from "./scrapers/batch-processor";
