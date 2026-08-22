import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateDealScore,
  calculateDetailedScore,
  getExpiringDeals,
  getHighValueDeals,
  getRecentDeals,
  getTopDeals,
  rankDeals,
  sortDeals,
} from "../../worker/lib/ranking";

import type {
  Deal,
  DealMetadata,
  Expiry,
  Reward,
  Source,
} from "../../worker/types";

type DealOverrides = Partial<Pick<Deal, "title" | "code" | "url">> & {
  source?: Partial<Pick<Source, "discovered_at" | "trust_score">>;
  reward?: Partial<Pick<Reward, "type" | "value">>;
  expiry?: Partial<Pick<Expiry, "date">>;
  metadata?: Partial<Pick<DealMetadata, "confidence_score" | "status">>;
};

const createMockDeal = (id: string, overrides: DealOverrides = {}): Deal => ({
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
    type: overrides.reward?.type || "cash",
    value: overrides.reward?.value ?? 50,
    currency: "USD",
  },
  expiry: {
    date: overrides.expiry?.date,
    confidence: 0.8,
    type: "soft",
  },
  metadata: {
    category: ["test"],
    tags: ["test"],
    normalized_at: new Date().toISOString(),
    confidence_score: overrides.metadata?.confidence_score ?? 0.5,
    status: overrides.metadata?.status || "active",
  },
});

describe("Ranking Logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
      metadata: { confidence_score: 0.9 },
      source: { trust_score: 0.9 },
    });
    const deal2 = createMockDeal("2", {
      metadata: { confidence_score: 0.1 },
      source: { trust_score: 0.1 },
    });

    const result = rankDeals([deal1, deal2], {
      sortBy: "confidence", // In sortDeals, default is composite score if field not explicitly handled or for rankDeals composite is used for scores breakdown
      order: "desc",
    });

    expect(result.deals[0]!.id).toBe("1");
    expect(result.scores![0]!.score).toBeGreaterThan(result.scores![1]!.score);
  });

  it("should filter deals by status", () => {
    const activeDeal = createMockDeal("active", {
      metadata: { status: "active" },
    });
    const rejectedDeal = createMockDeal("rejected", {
      metadata: { status: "rejected" },
    });

    const result = rankDeals([activeDeal, rejectedDeal], {
      sortBy: "confidence",
      order: "desc",
    });

    expect(result.deals).toHaveLength(1);
    expect(result.deals[0]!.id).toBe("active");
  });

  it("should filter by minConfidence", () => {
    const highConf = createMockDeal("high", {
      metadata: { confidence_score: 0.8 },
    });
    const lowConf = createMockDeal("low", {
      metadata: { confidence_score: 0.2 },
    });

    const result = rankDeals([highConf, lowConf], {
      sortBy: "confidence",
      order: "desc",
      minConfidence: 0.5,
    });

    expect(result.deals).toHaveLength(1);
    expect(result.deals[0]!.id).toBe("high");
  });

  it("should sort by recency", () => {
    const oldDate = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const newDate = new Date().toISOString();

    const oldDeal = createMockDeal("old", {
      source: { discovered_at: oldDate },
    });
    const newDeal = createMockDeal("new", {
      source: { discovered_at: newDate },
    });

    const sorted = sortDeals([oldDeal, newDeal], "recency", "desc");
    expect(sorted[0]!.id).toBe("new");
  });

  describe("Helper Query Functions", () => {
    it("should return top deals ordered by score and respect limit", () => {
      const deal1 = createMockDeal("top1", {
        metadata: { confidence_score: 0.95 },
        source: { trust_score: 0.95 },
      });
      const deal2 = createMockDeal("top2", {
        metadata: { confidence_score: 0.5 },
        source: { trust_score: 0.5 },
      });
      const deal3 = createMockDeal("top3", {
        metadata: { confidence_score: 0.1 },
        source: { trust_score: 0.1 },
      });

      const top = getTopDeals([deal2, deal3, deal1], 2);
      expect(top).toHaveLength(2);
      expect(top[0]!.id).toBe("top1");
      expect(top[1]!.id).toBe("top2");
    });

    it("should return deals expiring soon within cutoff", () => {
      const nowMs = new Date("2026-06-01T12:00:00Z").getTime();
      const expires5Days = new Date(
        nowMs + 5 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const expires10Days = new Date(
        nowMs + 10 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const dealSoon = createMockDeal("soon", {
        expiry: { date: expires5Days },
      });
      const dealFar = createMockDeal("far", {
        expiry: { date: expires10Days },
      });
      const dealNoExpiry = createMockDeal("none");

      const expiring = getExpiringDeals([dealSoon, dealFar, dealNoExpiry], 7);
      expect(expiring).toHaveLength(1);
      expect(expiring[0]!.id).toBe("soon");
    });

    it("should return recent deals discovered within threshold", () => {
      const nowMs = new Date("2026-06-01T12:00:00Z").getTime();
      const discovered2DaysAgo = new Date(
        nowMs - 2 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const discovered10DaysAgo = new Date(
        nowMs - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const dealRecent = createMockDeal("recent", {
        source: { discovered_at: discovered2DaysAgo },
      });
      const dealOld = createMockDeal("old", {
        source: { discovered_at: discovered10DaysAgo },
      });

      const recent = getRecentDeals([dealRecent, dealOld], 7);
      expect(recent).toHaveLength(1);
      expect(recent[0]!.id).toBe("recent");
    });

    it("should return high value deals above reward threshold", () => {
      const dealHigh = createMockDeal("high", {
        reward: { value: 100 },
      });
      const dealLow = createMockDeal("low", {
        reward: { value: 10 },
      });

      const highVal = getHighValueDeals([dealHigh, dealLow], 50);
      expect(highVal).toHaveLength(1);
      expect(highVal[0]!.id).toBe("high");
    });
  });
});
