/**
 * Batch Processor Tests (T-4)
 *
 * Covers worker/lib/validation/scrapers/batch-processor.ts: domain
 * grouping, change attachment, scrape-failure passthrough, the exception
 * catch row, getDealsWithRewardChanges filtering, and getScrapingStats
 * aggregation. scrapeCurrentRewards is mocked; no network access occurs.
 * Single-deal batches keep the per-deal politeness delay cheap.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Deal, Reward } from "../../worker/types";
import {
  batchScrapeRewards,
  getDealsWithRewardChanges,
  getScrapingStats,
} from "../../worker/lib/validation/scrapers/batch-processor";
import type { RewardScrapeResult } from "../../worker/lib/validation/scrapers/types";

vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../worker/lib/validation/scrapers/reward-scraper-core", () => ({
  scrapeCurrentRewards: vi.fn(),
  extractDomain: vi.fn((url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return "unknown";
    }
  }),
}));

async function mockScrape(
  impl: (url: string) => Promise<RewardScrapeResult>,
): Promise<ReturnType<typeof vi.fn>> {
  const { scrapeCurrentRewards } =
    await import("../../worker/lib/validation/scrapers/reward-scraper-core");
  const mocked = vi.mocked(scrapeCurrentRewards);
  mocked.mockImplementation(impl);
  return mocked;
}

function deal(id: string, url: string, value: number | string): Deal {
  return {
    id,
    url,
    reward: { type: "cash", value } as Reward,
  } as unknown as Deal;
}

function successResult(url: string, value: number): RewardScrapeResult {
  return {
    url,
    success: true,
    currentReward: { type: "cash", value } as Reward,
    rewardChanged: false,
    scrapedAt: new Date().toISOString(),
  };
}

describe("batchScrapeRewards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches change details when the reward moved", async () => {
    const scrape = await mockScrape(async (url) => successResult(url, 100));

    const results = await batchScrapeRewards([
      deal("d1", "https://a.com/x", 50),
    ]);

    expect(scrape).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.rewardChanged).toBe(true);
    expect(results[0]?.previousReward).toEqual({ type: "cash", value: 50 });
    expect(results[0]?.changeDetails).toMatchObject({
      typeChanged: false,
      valueChanged: true,
      oldValue: 50,
      newValue: 100,
    });
  });

  it("omits change details when the reward is unchanged", async () => {
    await mockScrape(async (url) => successResult(url, 50));

    const results = await batchScrapeRewards([
      deal("d1", "https://a.com/x", 50),
    ]);

    expect(results[0]?.rewardChanged).toBe(false);
    expect(results[0]?.previousReward).toBeUndefined();
    expect(results[0]?.changeDetails).toBeUndefined();
  });

  it("passes scrape failures through untouched", async () => {
    await mockScrape(async (url) => ({
      url,
      success: false,
      rewardChanged: false,
      scrapedAt: new Date().toISOString(),
      error: "HTTP 500: boom",
    }));

    const results = await batchScrapeRewards([
      deal("d1", "https://a.com/x", 50),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
    expect(results[0]?.error).toBe("HTTP 500: boom");
  });

  it("records a catch row when scraping throws", async () => {
    await mockScrape(async () => {
      throw new Error("socket hang up");
    });

    const results = await batchScrapeRewards([
      deal("d1", "https://a.com/x", 50),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
    expect(results[0]?.rewardChanged).toBe(false);
    expect(results[0]?.error).toBe("socket hang up");
  });

  it("scrapes every deal across domain groups", async () => {
    const scrape = await mockScrape(async (url) => successResult(url, 10));

    const results = await batchScrapeRewards([
      deal("d1", "https://a.com/x", 10),
      deal("d2", "https://b.com/y", 10),
    ]);

    expect(scrape).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });
});

describe("getDealsWithRewardChanges", () => {
  it("keeps only successful changed results with a reward", () => {
    const changed = successResult("https://a.com/1", 100);
    changed.rewardChanged = true;
    const unchanged = successResult("https://a.com/2", 50);
    const failed: RewardScrapeResult = {
      url: "https://a.com/3",
      success: false,
      rewardChanged: false,
      scrapedAt: new Date().toISOString(),
    };

    expect(getDealsWithRewardChanges([changed, unchanged, failed])).toEqual([
      changed,
    ]);
  });
});

describe("getScrapingStats", () => {
  function changedResult(
    url: string,
    oldValue: number,
    newValue: number,
    typeChanged = false,
  ): RewardScrapeResult {
    return {
      url,
      success: true,
      currentReward: { type: "cash", value: newValue } as Reward,
      rewardChanged: true,
      previousReward: { type: "cash", value: oldValue } as Reward,
      changeDetails: {
        typeChanged,
        valueChanged: true,
        oldValue,
        newValue,
      },
      scrapedAt: new Date().toISOString(),
    };
  }

  it("aggregates totals, failures, and change direction", () => {
    const stats = getScrapingStats([
      changedResult("https://a.com/1", 50, 100),
      changedResult("https://a.com/2", 100, 25),
      successResult("https://a.com/3", 10),
      {
        url: "https://a.com/4",
        success: false,
        rewardChanged: false,
        scrapedAt: new Date().toISOString(),
      },
    ]);

    expect(stats.total).toBe(4);
    expect(stats.successful).toBe(3);
    expect(stats.failed).toBe(1);
    expect(stats.withChanges).toBe(2);
    expect(stats.increased).toBe(1);
    expect(stats.decreased).toBe(1);
    expect(stats.typeChanged).toBe(0);
  });

  it("counts type changes", () => {
    const stats = getScrapingStats([
      changedResult("https://a.com/1", 50, 50, true),
    ]);

    expect(stats.typeChanged).toBe(1);
    expect(stats.withChanges).toBe(1);
  });
});
