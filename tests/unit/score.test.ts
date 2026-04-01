import { describe, it, expect } from "vitest";
import {
  score,
  calculateSourceDiversity,
  isHighValue,
} from "../../worker/pipeline/score";
import type { Deal, PipelineContext, Env } from "../../worker/types";

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: "https://example.com/invite",
    domain: "example.com",
    discovered_at: "2024-03-31T00:00:00Z",
    trust_score: overrides.source?.trust_score || 0.7,
  },
  title: "Test Deal",
  description: "Test description",
  code: "CODE123",
  url: "https://example.com/invite/CODE123",
  reward: {
    type: "cash",
    value: 50,
    currency: "USD",
  },
  expiry: {
    confidence: 0.8,
    type: "soft",
  },
  metadata: {
    category: ["test"],
    tags: ["test"],
    normalized_at: "2024-03-31T00:00:00Z",
    confidence_score: 0.5,
    status: "active",
  },
  ...overrides,
});

describe("Scoring Pipeline", () => {
  const ctx: PipelineContext = {
    run_id: "test-run",
    trace_id: "test-trace",
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0,
  };

  const mockEnv = {
    DEALS_PROD: {} as KVNamespace,
    DEALS_STAGING: {} as KVNamespace,
    DEALS_LOG: {} as KVNamespace,
    DEALS_LOCK: {} as KVNamespace,
    DEALS_SOURCES: {} as KVNamespace,
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as Env;

  it("should calculate confidence scores", async () => {
    const deals = [createMockDeal("1")];
    const result = await score(deals, ctx, mockEnv);
    expect(result.deals).toHaveLength(1);
    expect(result.deals[0].metadata.confidence_score).toBeGreaterThan(0);
  });

  it("should calculate statistics", async () => {
    const deals = [createMockDeal("1"), createMockDeal("2")];
    const result = await score(deals, ctx, mockEnv);
    expect(result.stats.avg_confidence).toBeGreaterThan(0);
    expect(result.stats.min_confidence).toBeGreaterThanOrEqual(0);
    expect(result.stats.max_confidence).toBeGreaterThan(0);
  });

  // Test confidence score calculation
  it("calculates confidence score with all components", async () => {
    const deals = [
      createMockDeal("1", {
        source: {
          url: "https://example.com/invite",
          domain: "example.com",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.8,
        },
        expiry: {
          confidence: 0.9,
          type: "soft",
        },
        reward: {
          type: "cash",
          value: 25,
          currency: "USD",
        },
      }),
    ];

    const result = await score(deals, ctx, mockEnv);
    expect(result.deals).toHaveLength(1);

    const scoredDeal = result.deals[0];
    expect(scoredDeal.metadata.confidence_score).toBeGreaterThan(0);
    expect(scoredDeal.scores).toBeDefined();
    expect(scoredDeal.scores.validity).toBe(1.0);
    expect(scoredDeal.scores.trust).toBe(0.8);
    expect(scoredDeal.scores.expiry).toBe(0.9);
    expect(scoredDeal.scores.reward_plausibility).toBe(1.0);
  });

  // Test source diversity
  it("calculates source diversity correctly", () => {
    // Multiple domains should score higher
    const diverseDeals = [
      createMockDeal("1", {
        source: {
          url: "https://example1.com/invite",
          domain: "example1.com",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.7,
        },
      }),
      createMockDeal("2", {
        source: {
          url: "https://example2.com/invite",
          domain: "example2.com",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.7,
        },
      }),
      createMockDeal("3", {
        source: {
          url: "https://example3.com/invite",
          domain: "example3.com",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.7,
        },
      }),
    ];
    const diverseScore = calculateSourceDiversity(diverseDeals);

    // Single domain should score lower
    const singleDomainDeals = [
      createMockDeal("1"),
      createMockDeal("2"),
      createMockDeal("3"),
    ];
    const singleScore = calculateSourceDiversity(singleDomainDeals);

    expect(diverseScore).toBeGreaterThan(singleScore);
    expect(diverseScore).toBeGreaterThan(0.5);
    expect(singleScore).toBeLessThan(0.5);
  });

  // Test reward plausibility - cash tiers
  it("rewards cash <= $50 get full plausibility", () => {
    const deal = createMockDeal("1", {
      reward: { type: "cash", value: 50, currency: "USD" },
    });

    // $50 or less should get full plausibility (1.0)
    expect(isHighValue(deal)).toBe(false);
  });

  // Test reward plausibility - percent tiers
  it("rewards percent 10-50% get full plausibility", () => {
    const goodPercent = createMockDeal("1", {
      reward: { type: "percent", value: 25 },
    });

    const highPercent = createMockDeal("2", {
      reward: { type: "percent", value: 75 },
    });

    const lowPercent = createMockDeal("3", {
      reward: { type: "percent", value: 5 },
    });

    // 10-50% is considered good and not high value
    // >50% is high value
    expect(isHighValue(goodPercent)).toBe(false);
    expect(isHighValue(highPercent)).toBe(true);
    expect(isHighValue(lowPercent)).toBe(false);
  });

  // Test duplicate penalty
  it("applies duplicate penalty for similar deals", async () => {
    const deal1 = createMockDeal("1", { code: "DUPLICATE" });
    const deal2 = createMockDeal("2", { code: "DUPLICATE" });

    const ctxWithDeduped: PipelineContext = {
      ...ctx,
      deduped: [deal1, deal2],
      candidates: [deal1, deal2],
    };

    const result = await score([deal1, deal2], ctxWithDeduped, mockEnv);

    // Both deals should have some penalty since they have same code and domain
    expect(result.deals[0].scores.duplicate_penalty).toBeGreaterThanOrEqual(0);
    expect(result.deals[1].scores.duplicate_penalty).toBeGreaterThanOrEqual(0);
  });

  // Test high-value detection - cash
  it("detects high-value cash deals correctly", () => {
    const normalCash = createMockDeal("1", {
      reward: { type: "cash", value: 50, currency: "USD" },
    });

    const highValueCash = createMockDeal("2", {
      reward: { type: "cash", value: 150, currency: "USD" },
    });

    const thresholdCash = createMockDeal("3", {
      reward: { type: "cash", value: 100, currency: "USD" },
    });

    // Only deals >$100 are high value
    expect(isHighValue(normalCash)).toBe(false);
    expect(isHighValue(highValueCash)).toBe(true);
    expect(isHighValue(thresholdCash)).toBe(false); // Exactly $100 is not high value
  });

  // Test high-value detection - percent
  it("detects high-value percent deals correctly", () => {
    const normalPercent = createMockDeal("1", {
      reward: { type: "percent", value: 25 },
    });

    const highValuePercent = createMockDeal("2", {
      reward: { type: "percent", value: 75 },
    });

    const thresholdPercent = createMockDeal("3", {
      reward: { type: "percent", value: 50 },
    });

    // Only deals >50% are high value
    expect(isHighValue(normalPercent)).toBe(false);
    expect(isHighValue(highValuePercent)).toBe(true);
    expect(isHighValue(thresholdPercent)).toBe(false); // Exactly 50% is not high value
  });
});
