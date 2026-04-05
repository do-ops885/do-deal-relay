import { describe, it, expect } from "vitest";
import type { Deal } from "../../../worker/types";
import {
  batchAutoCategorize,
  getCategoryStats,
  getTagStats,
} from "../../../worker/lib/categorization/index";

// ============================================================================
// Test Helpers
// ============================================================================

const createMockDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: overrides.id || "deal-1",
  source: {
    url: overrides.source?.url || "https://example.com/ref",
    domain: overrides.source?.domain || "example.com",
    discovered_at: overrides.source?.discovered_at || "2024-03-31T00:00:00Z",
    trust_score: overrides.source?.trust_score ?? 0.7,
  },
  title: overrides.title || "Test Deal",
  description: overrides.description || "A test referral deal",
  code: overrides.code || "REF123",
  url: overrides.url || "https://example.com/ref/REF123",
  reward: {
    type: overrides.reward?.type || "cash",
    value: overrides.reward?.value ?? 50,
    currency: overrides.reward?.currency || "USD",
  },
  expiry: {
    date: overrides.expiry?.date,
    confidence: overrides.expiry?.confidence ?? 0.8,
    type: overrides.expiry?.type || "soft",
  },
  metadata: {
    category: overrides.metadata?.category || [],
    tags: overrides.metadata?.tags || [],
    normalized_at: overrides.metadata?.normalized_at || "2024-03-31T00:00:00Z",
    confidence_score: overrides.metadata?.confidence_score ?? 0.75,
    status: overrides.metadata?.status || "active",
  },
});

describe("Categorization: batchAutoCategorize", () => {
  it("should categorize multiple deals", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        source: {
          domain: "robinhood.com",
          url: "https://robinhood.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.8,
        },
        title: "Free stock when you sign up",
        description: "Open a brokerage account",
        code: "STOCK1",
      }),
      createMockDeal({
        id: "2",
        source: {
          domain: "doordash.com",
          url: "https://doordash.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.8,
        },
        title: "Free food delivery",
        description: "Get meals delivered to your door",
        code: "FOOD1",
      }),
    ];

    const results = batchAutoCategorize(deals);
    expect(results).toHaveLength(2);
    expect(results[0].metadata.category).toContain("finance");
    expect(results[1].metadata.category).toContain("food_delivery");
  });

  it("should return same number of deals as input", () => {
    const deals: Deal[] = Array.from({ length: 10 }, (_, i) =>
      createMockDeal({ id: `deal-${i}` }),
    );

    const results = batchAutoCategorize(deals);
    expect(results).toHaveLength(10);
  });

  it("should handle empty array", () => {
    const results = batchAutoCategorize([]);
    expect(results).toHaveLength(0);
  });

  it("should not mutate original deals", () => {
    const deal = createMockDeal({
      id: "1",
      metadata: {
        category: ["original"],
        tags: ["original-tag"],
        normalized_at: "2024-03-31T00:00:00Z",
        confidence_score: 0.5,
        status: "active",
      },
    });
    const originalCategory = [...deal.metadata.category];

    batchAutoCategorize([deal]);
    expect(deal.metadata.category).toEqual(originalCategory);
  });
});

describe("Categorization: getCategoryStats", () => {
  it("should return empty object for no deals", () => {
    const stats = getCategoryStats([]);
    expect(stats).toEqual({});
  });

  it("should count deals per category", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["finance"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        metadata: {
          category: ["finance"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "3",
        metadata: {
          category: ["shopping"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const stats = getCategoryStats(deals);
    expect(stats["finance"]).toBe(2);
    expect(stats["shopping"]).toBe(1);
  });

  it("should handle deals with multiple categories", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["finance", "referral"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const stats = getCategoryStats(deals);
    expect(stats["finance"]).toBe(1);
    expect(stats["referral"]).toBe(1);
  });

  it("should accumulate counts across deals", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["finance", "referral"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        metadata: {
          category: ["referral"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const stats = getCategoryStats(deals);
    expect(stats["referral"]).toBe(2);
    expect(stats["finance"]).toBe(1);
  });
});

describe("Categorization: getTagStats", () => {
  it("should return empty object for no deals", () => {
    const stats = getTagStats([]);
    expect(stats).toEqual({});
  });

  it("should count deals per tag", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["test"],
          tags: ["signup_bonus", "high_value"],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        metadata: {
          category: ["test"],
          tags: ["signup_bonus"],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const stats = getTagStats(deals);
    expect(stats["signup_bonus"]).toBe(2);
    expect(stats["high_value"]).toBe(1);
  });

  it("should handle empty tag arrays", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const stats = getTagStats(deals);
    expect(stats).toEqual({});
  });
});
