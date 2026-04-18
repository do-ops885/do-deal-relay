import { describe, it, expect } from "vitest";
import {
  calculateDealScore,
  calculateDetailedScore,
} from "../../worker/lib/ranking";
import { Deal } from "../../worker/types";

const createMockDeal = (overrides: Partial<Deal> = {}): Deal =>
  ({
    id: "test-id",
    source: {
      url: "https://example.com",
      domain: "example.com",
      discovered_at: new Date().toISOString(),
      trust_score: 0.8,
    },
    title: "Test Deal",
    description: "Test description",
    code: "TEST123",
    url: "https://example.com/ref",
    reward: {
      type: "cash",
      value: 50,
      currency: "USD",
    },
    expiry: {
      type: "soft",
    },
    metadata: {
      category: ["finance"],
      tags: ["test"],
      normalized_at: new Date().toISOString(),
      confidence_score: 0.9,
      status: "active",
    },
    ...overrides,
  }) as Deal;

describe("Ranking Scoring Logic", () => {
  it("calculateDealScore and calculateDetailedScore should be consistent", () => {
    const deal = createMockDeal();
    const score = calculateDealScore(deal);
    const { score: detailedScore } = calculateDetailedScore(deal);

    // Allow for small floating point differences
    expect(score).toBeCloseTo(detailedScore, 5);
  });

  it("should calculate correct weighted score", () => {
    // Fixed dates for predictable recency and expiry scores
    const now = new Date();
    const discoveredAt = now.toISOString();
    const expiryDate = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 30 days in future

    const deal = createMockDeal({
      source: {
        url: "https://example.com",
        domain: "example.com",
        discovered_at: discoveredAt,
        trust_score: 1.0,
      },
      metadata: {
        category: ["finance"],
        tags: ["test"],
        normalized_at: now.toISOString(),
        confidence_score: 1.0,
        status: "active",
      },
      expiry: {
        type: "hard",
        date: expiryDate,
      },
    });

    const detailed = calculateDetailedScore(deal);

    // confidence: 1.0 * 100 = 100
    // trust: 1.0 * 100 = 100
    // recency: discovered now = 100
    // value: 0 cash -> (50/500)*100 * 1.2 = 12
    // expiry: 30 days left -> (30/90)*100 = 33.33

    expect(detailed.breakdown.confidence).toBe(100);
    expect(detailed.breakdown.trust).toBe(100);
    expect(detailed.breakdown.recency).toBe(100);
    expect(detailed.breakdown.value).toBe(12);
    expect(detailed.breakdown.expiry).toBeCloseTo(33.33, 1);

    const expectedScore =
      100 * 0.25 + 100 * 0.2 + 100 * 0.2 + 12 * 0.2 + 33.333 * 0.15;
    expect(detailed.score).toBeCloseTo(expectedScore, 1);
  });
});
