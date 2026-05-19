import { describe, it, expect } from "vitest";
import {
  calculateDealScore,
  calculateDetailedScore,
  rankDeals,
  sortDeals,
} from "../../worker/lib/ranking";
import type { Deal } from "../../worker/types";

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: "https://example.com/invite",
    domain: "example.com",
    discovered_at: overrides.source?.discovered_at || new Date().toISOString(),
    trust_score: overrides.source?.trust_score ?? 0.7,
  },
  title: overrides.title || "Test Deal",
  description: "Test description",
  code: overrides.code || "CODE123",
  url: overrides.url || "https://example.com/invite/CODE123",
  reward: {
    type: (overrides.reward?.type as any) || "cash",
    value: overrides.reward?.value ?? 50,
    currency: "USD",
  },
  expiry: {
    date: overrides.expiry?.date,
    confidence: overrides.expiry?.confidence ?? 0.8,
    type: (overrides.expiry?.type as any) || "soft",
  },
  metadata: {
    category: overrides.metadata?.category || ["test"],
    tags: ["test"],
    normalized_at: new Date().toISOString(),
    confidence_score: overrides.metadata?.confidence_score ?? 0.5,
    status: (overrides.metadata?.status as any) || "active",
  },
});

describe("Ranking Logic", () => {
  it("should calculate consistent scores between simple and detailed functions", () => {
    const deal = createMockDeal("1");
    const simpleScore = calculateDealScore(deal);
    const { score: detailedScore, breakdown } = calculateDetailedScore(deal);

    expect(simpleScore).toBe(detailedScore);
    expect(breakdown.confidence).toBe(deal.metadata.confidence_score * 100);
    expect(breakdown.trust).toBe(deal.source.trust_score * 100);
  });

  it("should rank deals by composite score", () => {
    const deal1 = createMockDeal("1", {
      metadata: { confidence_score: 0.9 } as any,
      source: { trust_score: 0.9 } as any,
    });
    const deal2 = createMockDeal("2", {
      metadata: { confidence_score: 0.1 } as any,
      source: { trust_score: 0.1 } as any,
    });

    const result = rankDeals([deal1, deal2], {
      sortBy: "confidence", // In sortDeals, default is composite score if field not explicitly handled or for rankDeals composite is used for scores breakdown
      order: "desc",
    });

    expect(result.deals[0].id).toBe("1");
    expect(result.scores![0].score).toBeGreaterThan(result.scores![1].score);
  });

  it("should filter deals by status", () => {
    const activeDeal = createMockDeal("active", {
      metadata: { status: "active" } as any,
    });
    const rejectedDeal = createMockDeal("rejected", {
      metadata: { status: "rejected" } as any,
    });

    const result = rankDeals([activeDeal, rejectedDeal], {
      sortBy: "confidence",
      order: "desc",
    });

    expect(result.deals).toHaveLength(1);
    expect(result.deals[0].id).toBe("active");
  });

  it("should filter by minConfidence", () => {
    const highConf = createMockDeal("high", {
      metadata: { confidence_score: 0.8 } as any,
    });
    const lowConf = createMockDeal("low", {
      metadata: { confidence_score: 0.2 } as any,
    });

    const result = rankDeals([highConf, lowConf], {
      sortBy: "confidence",
      order: "desc",
      minConfidence: 0.5,
    });

    expect(result.deals).toHaveLength(1);
    expect(result.deals[0].id).toBe("high");
  });

  it("should sort by recency", () => {
    const oldDate = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const newDate = new Date().toISOString();

    const oldDeal = createMockDeal("old", {
      source: { discovered_at: oldDate } as any,
    });
    const newDeal = createMockDeal("new", {
      source: { discovered_at: newDate } as any,
    });

    const sorted = sortDeals([oldDeal, newDeal], "recency", "desc");
    expect(sorted[0].id).toBe("new");
  });
});
