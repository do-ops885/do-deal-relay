import type { Deal, Env } from "../../../types";
import { logger } from "../../global-logger";
import type { RewardScrapeResult } from "./types";
import { scrapeCurrentRewards, extractDomain } from "./reward-scraper-core";
import { compareRewards } from "./change-detector";

function normalizeValue(value: number | string): number | string {
  if (typeof value === "number") {
    return Math.round(value * 100) / 100;
  }
  return String(value).toLowerCase().trim();
}

export async function batchScrapeRewards(
  deals: Deal[],
  env?: Env,
): Promise<RewardScrapeResult[]> {
  logger.info(`Starting batch reward scraping for ${deals.length} deals`, {
    component: "reward-scraper",
    batchSize: deals.length,
  });

  const results: RewardScrapeResult[] = [];
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const domainGroups = new Map<string, Deal[]>();
  for (const deal of deals) {
    const domain = extractDomain(deal.url);
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain)!.push(deal);
  }

  for (const [, domainDeals] of domainGroups) {
    for (const deal of domainDeals) {
      try {
        const result = await scrapeCurrentRewards(deal.url, env);

        if (result.currentReward) {
          const change = compareRewards(deal.reward, result.currentReward);
          results.push({
            ...result,
            rewardChanged: change.changed,
            previousReward: change.changed ? deal.reward : undefined,
            changeDetails: change.changed
              ? {
                  typeChanged: change.typeChanged,
                  valueChanged: change.valueChanged,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                }
              : undefined,
          });
        } else {
          results.push(result);
        }

        await delay(1000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.push({
          url: deal.url,
          success: false,
          rewardChanged: false,
          scrapedAt: new Date().toISOString(),
          error: errorMessage,
        });
      }
    }
  }

  logger.info(`Batch reward scraping completed`, {
    component: "reward-scraper",
    total: results.length,
    successful: results.filter((r) => r.success).length,
    changed: results.filter((r) => r.rewardChanged).length,
  });

  return results;
}

export function getDealsWithRewardChanges(
  results: RewardScrapeResult[],
): RewardScrapeResult[] {
  return results.filter((r) => r.success && r.rewardChanged && r.currentReward);
}

export function getScrapingStats(results: RewardScrapeResult[]): {
  total: number;
  successful: number;
  failed: number;
  withChanges: number;
  increased: number;
  decreased: number;
  typeChanged: number;
} {
  const successful = results.filter((r) => r.success).length;
  const withChanges = results.filter((r) => r.rewardChanged).length;
  const increased = results.filter(
    (r) =>
      r.changeDetails?.valueChanged &&
      r.currentReward &&
      normalizeValue(r.currentReward.value) >
        normalizeValue(r.previousReward?.value || 0),
  ).length;
  const decreased = results.filter(
    (r) =>
      r.changeDetails?.valueChanged &&
      r.currentReward &&
      normalizeValue(r.currentReward.value) <
        normalizeValue(r.previousReward?.value || 0),
  ).length;
  const typeChanged = results.filter(
    (r) => r.changeDetails?.typeChanged,
  ).length;

  return {
    total: results.length,
    successful,
    failed: results.length - successful,
    withChanges,
    increased,
    decreased,
    typeChanged,
  };
}
