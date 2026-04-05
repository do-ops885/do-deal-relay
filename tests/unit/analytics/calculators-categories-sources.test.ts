import { describe, it, expect } from "vitest";
import type { Deal } from "../../../worker/types";
import {
  calculateCategoryBreakdown,
  calculateSourcePerformance,
} from "../../../worker/lib/analytics/calculators";

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
    category: overrides.metadata?.category || ["referral"],
    tags: overrides.metadata?.tags || ["test"],
    normalized_at: overrides.metadata?.normalized_at || "2024-03-31T00:00:00Z",
    confidence_score: overrides.metadata?.confidence_score ?? 0.75,
    status: overrides.metadata?.status || "active",
  },
});

describe("Analytics: Category Breakdown", () => {
  it("should return empty array for no deals", () => {
    const result = calculateCategoryBreakdown([]);
    expect(result).toEqual([]);
  });

  it("should aggregate deals by category", () => {
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
          confidence_score: 0.6,
          status: "active",
        },
      }),
      createMockDeal({
        id: "3",
        metadata: {
          category: ["shopping"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.9,
          status: "active",
        },
      }),
    ];

    const result = calculateCategoryBreakdown(deals);
    expect(result).toHaveLength(2);

    const finance = result.find((c) => c.category === "finance");
    expect(finance?.count).toBe(2);
    expect(finance?.avgConfidence).toBe(0.7);

    const shopping = result.find((c) => c.category === "shopping");
    expect(shopping?.count).toBe(1);
    expect(shopping?.avgConfidence).toBe(0.9);
  });

  it("should handle deals with multiple categories", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "multi",
        metadata: {
          category: ["finance", "referral"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const result = calculateCategoryBreakdown(deals);
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.category === "finance")).toBeDefined();
    expect(result.find((c) => c.category === "referral")).toBeDefined();
  });

  it("should calculate average value correctly", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        reward: { type: "cash", value: 100 },
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
        reward: { type: "cash", value: 200 },
        metadata: {
          category: ["finance"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const result = calculateCategoryBreakdown(deals);
    const finance = result.find((c) => c.category === "finance");
    expect(finance?.avgValue).toBe(150);
  });

  it("should handle non-numeric reward values", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        reward: { type: "item", value: "free trial" },
        metadata: {
          category: ["software"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const result = calculateCategoryBreakdown(deals);
    const software = result.find((c) => c.category === "software");
    expect(software?.avgValue).toBe(0);
  });

  it("should round avgConfidence to 2 decimal places", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.333,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.666,
          status: "active",
        },
      }),
      createMockDeal({
        id: "3",
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.5,
          status: "active",
        },
      }),
    ];

    const result = calculateCategoryBreakdown(deals);
    const test = result.find((c) => c.category === "test");
    expect(test?.avgConfidence).toBe(0.5);
  });
});

describe("Analytics: Source Performance", () => {
  it("should return empty array for no deals", () => {
    const result = calculateSourcePerformance([], []);
    expect(result).toEqual([]);
  });

  it("should aggregate deals by domain", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        source: {
          domain: "robinhood.com",
          url: "https://robinhood.com/ref",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.8,
        },
      }),
      createMockDeal({
        id: "2",
        source: {
          domain: "robinhood.com",
          url: "https://robinhood.com/ref2",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.8,
        },
      }),
      createMockDeal({
        id: "3",
        source: {
          domain: "amazon.com",
          url: "https://amazon.com/ref",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.9,
        },
      }),
    ];

    const result = calculateSourcePerformance(deals, []);
    expect(result).toHaveLength(2);

    const robinhood = result.find((s) => s.domain === "robinhood.com");
    expect(robinhood?.dealsDiscovered).toBe(2);

    const amazon = result.find((s) => s.domain === "amazon.com");
    expect(amazon?.dealsDiscovered).toBe(1);
  });

  it("should count only active deals as published", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        source: {
          domain: "test.com",
          url: "https://test.com/ref",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.7,
        },
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        source: {
          domain: "test.com",
          url: "https://test.com/ref2",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.7,
        },
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "quarantined",
        },
      }),
    ];

    const result = calculateSourcePerformance(deals, []);
    const test = result.find((s) => s.domain === "test.com");
    expect(test?.dealsDiscovered).toBe(2);
    expect(test?.dealsPublished).toBe(1);
  });

  it("should merge trust scores from source registry", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        source: {
          domain: "robinhood.com",
          url: "https://robinhood.com/ref",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.8,
        },
      }),
    ];
    const registry = [
      { domain: "robinhood.com", trust_initial: 0.85 } as {
        domain: string;
        trust_initial: number;
      },
    ];

    const result = calculateSourcePerformance(deals, registry);
    expect(result[0].trustScore).toBe(0.85);
  });

  it("should use default trust score when source not in registry", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        source: {
          domain: "unknown.com",
          url: "https://unknown.com/ref",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.5,
        },
      }),
    ];

    const result = calculateSourcePerformance(deals, []);
    expect(result[0].trustScore).toBe(0.5);
  });

  it("should calculate average confidence per source", () => {
    const deals: Deal[] = [
      createMockDeal({
        id: "1",
        source: {
          domain: "test.com",
          url: "https://test.com/ref",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.7,
        },
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.6,
          status: "active",
        },
      }),
      createMockDeal({
        id: "2",
        source: {
          domain: "test.com",
          url: "https://test.com/ref2",
          discovered_at: "2024-01-01T00:00:00Z",
          trust_score: 0.7,
        },
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: "2024-01-01T00:00:00Z",
          confidence_score: 0.8,
          status: "active",
        },
      }),
    ];

    const result = calculateSourcePerformance(deals, []);
    const test = result.find((s) => s.domain === "test.com");
    expect(test?.avgConfidence).toBe(0.7);
  });
});
