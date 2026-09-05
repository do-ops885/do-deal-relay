/**
 * Change Detector Tests (T-4)
 *
 * Covers worker/lib/validation/scrapers/change-detector.ts: the pure
 * compareRewards matrix (type/value direction, string normalization,
 * float rounding) and detectRewardChanges orchestration (scrape failure,
 * no-change, increase/decrease/type-change, critical threshold).
 * scrapeCurrentRewards is mocked; no network access occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Deal, Reward } from "../../worker/types";
import {
  compareRewards,
  detectRewardChanges,
} from "../../worker/lib/validation/scrapers/change-detector";

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

function reward(type: Reward["type"], value: number | string): Reward {
  return { type, value };
}

function deal(rewardValue: Reward): Deal {
  return {
    id: "deal-1",
    url: "https://example.com/deal",
    reward: rewardValue,
  } as unknown as Deal;
}

async function mockScrape(
  currentReward: Reward | null,
  success = true,
): Promise<void> {
  const { scrapeCurrentRewards } =
    await import("../../worker/lib/validation/scrapers/reward-scraper-core");
  vi.mocked(scrapeCurrentRewards).mockResolvedValue({
    url: "https://example.com/deal",
    success,
    currentReward: currentReward ?? undefined,
    rewardChanged: false,
    scrapedAt: new Date().toISOString(),
  });
}

describe("compareRewards", () => {
  it("reports no change for identical rewards", () => {
    const result = compareRewards(reward("cash", 50), reward("cash", 50));

    expect(result.changed).toBe(false);
    expect(result.typeChanged).toBe(false);
    expect(result.valueChanged).toBe(false);
    expect(result.valueIncreased).toBe(false);
    expect(result.valueDecreased).toBe(false);
  });

  it("detects value increases and decreases", () => {
    const up = compareRewards(reward("cash", 50), reward("cash", 100));
    expect(up.changed).toBe(true);
    expect(up.valueChanged).toBe(true);
    expect(up.valueIncreased).toBe(true);
    expect(up.valueDecreased).toBe(false);
    expect(up.oldValue).toBe(50);
    expect(up.newValue).toBe(100);

    const down = compareRewards(reward("cash", 100), reward("cash", 50));
    expect(down.valueDecreased).toBe(true);
    expect(down.valueIncreased).toBe(false);
  });

  it("detects type changes", () => {
    const result = compareRewards(reward("cash", 50), reward("percent", 50));

    expect(result.changed).toBe(true);
    expect(result.typeChanged).toBe(true);
    expect(result.valueChanged).toBe(false);
  });

  it("normalizes strings case-insensitively with trimming", () => {
    const result = compareRewards(
      reward("item", "Gold"),
      reward("item", "  gold "),
    );

    expect(result.changed).toBe(false);
    expect(result.oldValue).toBe("gold");
    expect(result.newValue).toBe("gold");
  });

  it("rounds floats to cents before comparing", () => {
    const same = compareRewards(reward("cash", 10.001), reward("cash", 10.002));
    expect(same.valueChanged).toBe(false);

    const different = compareRewards(
      reward("cash", 10.004),
      reward("cash", 10.006),
    );
    expect(different.valueChanged).toBe(true);
  });

  it("never flags direction for string values", () => {
    const result = compareRewards(reward("item", "a"), reward("item", "b"));

    expect(result.valueChanged).toBe(true);
    expect(result.valueIncreased).toBe(false);
    expect(result.valueDecreased).toBe(false);
  });

  it("treats mixed number/string values as changed without direction", () => {
    const result = compareRewards(reward("cash", 50), reward("cash", "fifty"));

    expect(result.valueChanged).toBe(true);
    expect(result.valueIncreased).toBe(false);
    expect(result.valueDecreased).toBe(false);
  });
});

describe("detectRewardChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when scraping fails", async () => {
    await mockScrape(null, false);

    const result = await detectRewardChanges(deal(reward("cash", 50)));

    expect(result).toBeNull();
  });

  it("returns null when the reward is unchanged", async () => {
    await mockScrape(reward("cash", 50));

    const result = await detectRewardChanges(deal(reward("cash", 50)));

    expect(result).toBeNull();
  });

  it("reports increased rewards with info severity", async () => {
    await mockScrape(reward("cash", 100));

    const result = await detectRewardChanges(deal(reward("cash", 50)));

    expect(result?.changeType).toBe("increased");
    expect(result?.severity).toBe("info");
    expect(result?.previousReward).toEqual(reward("cash", 50));
    expect(result?.currentReward).toEqual(reward("cash", 100));
    expect(typeof result?.detectedAt).toBe("string");
  });

  it("reports decreased rewards with warning severity", async () => {
    await mockScrape(reward("cash", 25));

    const result = await detectRewardChanges(deal(reward("cash", 50)));

    expect(result?.changeType).toBe("decreased");
    expect(result?.severity).toBe("warning");
  });

  it("reports type changes with warning severity", async () => {
    await mockScrape(reward("percent", 20));

    const result = await detectRewardChanges(deal(reward("cash", 20)));

    expect(result?.changeType).toBe("type_changed");
    expect(result?.severity).toBe("warning");
  });

  it("escalates huge jumps to critical severity", async () => {
    await mockScrape(reward("cash", 5000));

    const result = await detectRewardChanges(deal(reward("cash", 50)));

    expect(result?.changeType).toBe("increased");
    expect(result?.severity).toBe("critical");
  });
});
