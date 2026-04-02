import { describe, it, expect } from "vitest";
import {
  rankDeals,
  calculateRecencyScore,
  calculateValueScore,
  calculateCompositeScore,
  calculateTrustScore,
  calculateConfidenceScore,
  getTopDeals,
  getDealsByTier,
  type RankingOptions,
} from "../../worker/lib/ranker";
import type { Deal } from "../../worker/types";

const createMockDeal = (
  id: string,
  overrides: Partial<Deal> = {},
  discoveredAt?: string,
): Deal => ({
  id,
  source: {
    url: "https://example.com/invite",
    domain: "example.com",
    discovered_at: discoveredAt || new Date().toISOString(),
    trust_score: overrides.source?.trust_score ?? 0.7,
  },
  title: "Test Deal",
  description: "Test description",
  code: `CODE${id}`,
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
    category: ["finance"],
    tags: ["test"],
    normalized_at: new Date().toISOString(),
    confidence_score: 0.5,
    status: "active",
  },
  ...overrides,
});

describe("Deal Ranker", () => {
  describe("calculateRecencyScore", () => {
    it("returns 1.0 for deals discovered now", () => {
      const deal = createMockDeal("1");
      const score = calculateRecencyScore(deal, 30);
      expect(score).toBeCloseTo(1.0, 1);
    });

    it("returns 0.0 for deals older than maxAge", () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);
      const deal = createMockDeal("1", {}, oldDate.toISOString());
      const score = calculateRecencyScore(deal, 30);
      expect(score).toBe(0.0);
    });

    it("returns linear decay for middle-aged deals", () => {
      const midDate = new Date();
      midDate.setDate(midDate.getDate() - 15);
      const deal = createMockDeal("1", {}, midDate.toISOString());
      const score = calculateRecencyScore(deal, 30);
      expect(score).toBeCloseTo(0.5, 1);
    });
  });

  describe("calculateValueScore", () => {
    it("returns 1.0 for $500 cash deals", () => {
      const deal = createMockDeal("1", {
        reward: { type: "cash", value: 500, currency: "USD" },
      });
      expect(calculateValueScore(deal)).toBe(1.0);
    });

    it("returns 0.5 for $250 cash deals", () => {
      const deal = createMockDeal("1", {
        reward: { type: "cash", value: 250, currency: "USD" },
      });
      expect(calculateValueScore(deal)).toBe(0.5);
    });

    it("returns 1.0 for 100% percent deals", () => {
      const deal = createMockDeal("1", {
        reward: { type: "percent", value: 100 },
      });
      expect(calculateValueScore(deal)).toBe(1.0);
    });

    it("returns 0.25 for 25% percent deals", () => {
      const deal = createMockDeal("1", {
        reward: { type: "percent", value: 25 },
      });
      expect(calculateValueScore(deal)).toBe(0.25);
    });

    it("handles item rewards with default score", () => {
      const deal = createMockDeal("1", {
        reward: { type: "item", value: "Free T-Shirt" },
      });
      expect(calculateValueScore(deal)).toBe(0.6);
    });

    it("handles credit rewards", () => {
      const deal = createMockDeal("1", {
        reward: { type: "credit", value: 100, currency: "USD" },
      });
      // 100/500 * 0.9 = 0.18
      expect(calculateValueScore(deal)).toBeCloseTo(0.18, 2);
    });
  });

  describe("calculateTrustScore", () => {
    it("returns trust_score from source", () => {
      const deal = createMockDeal("1", {
        source: {
          url: "https://example.com",
          domain: "example.com",
          discovered_at: new Date().toISOString(),
          trust_score: 0.85,
        },
      });
      expect(calculateTrustScore(deal)).toBe(0.85);
    });
  });

  describe("calculateConfidenceScore", () => {
    it("returns confidence_score from metadata", () => {
      const deal = createMockDeal("1", {
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: new Date().toISOString(),
          confidence_score: 0.9,
          status: "active",
        },
      });
      expect(calculateConfidenceScore(deal)).toBe(0.9);
    });
  });

  describe("calculateCompositeScore", () => {
    it("calculates correct composite score", () => {
      const deal = createMockDeal("1", {
        source: {
          url: "https://example.com",
          domain: "example.com",
          discovered_at: new Date().toISOString(),
          trust_score: 0.8,
        },
        reward: { type: "cash", value: 250, currency: "USD" },
        metadata: {
          category: ["test"],
          tags: [],
          normalized_at: new Date().toISOString(),
          confidence_score: 0.7,
          status: "active",
        },
      });

      const score = calculateCompositeScore(deal, 30);
      // confidence(0.7)*0.4 + value(0.5)*0.25 + recency(~1.0)*0.2 + trust(0.8)*0.15
      // = 0.28 + 0.125 + 0.2 + 0.12 = 0.725
      expect(score).toBeCloseTo(0.725, 2);
    });
  });

  describe("rankDeals", () => {
    it("sorts by confidence descending by default", () => {
      const deals = [
        createMockDeal("1", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.3,
            status: "active",
          },
        }),
        createMockDeal("2", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.9,
            status: "active",
          },
        }),
        createMockDeal("3", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.6,
            status: "active",
          },
        }),
      ];

      const options: RankingOptions = {
        sortBy: "confidence",
        order: "desc",
      };

      const ranked = rankDeals(deals, options);
      expect(ranked[0].id).toBe("2"); // 0.9 confidence
      expect(ranked[1].id).toBe("3"); // 0.6 confidence
      expect(ranked[2].id).toBe("1"); // 0.3 confidence
    });

    it("sorts by value ascending when specified", () => {
      const deals = [
        createMockDeal("1", {
          reward: { type: "cash", value: 100, currency: "USD" },
        }),
        createMockDeal("2", {
          reward: { type: "cash", value: 50, currency: "USD" },
        }),
        createMockDeal("3", {
          reward: { type: "cash", value: 200, currency: "USD" },
        }),
      ];

      const options: RankingOptions = {
        sortBy: "value",
        order: "asc",
      };

      const ranked = rankDeals(deals, options);
      expect(ranked[0].id).toBe("2"); // $50
      expect(ranked[1].id).toBe("1"); // $100
      expect(ranked[2].id).toBe("3"); // $200
    });

    it("assigns correct tiers based on percentiles", () => {
      const deals = Array.from({ length: 10 }, (_, i) =>
        createMockDeal(String(i + 1), {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: i * 0.1,
            status: "active",
          },
        }),
      );

      const options: RankingOptions = {
        sortBy: "confidence",
        order: "desc",
      };

      const ranked = rankDeals(deals, options);
      // Top 10% (position 1) should be "top"
      expect(ranked[0].ranking.tier).toBe("top");
      // Positions 2-3 should be "good" (top 30%)
      expect(ranked[1].ranking.tier).toBe("good");
      expect(ranked[2].ranking.tier).toBe("good");
      // Positions 4-7 should be "average" (middle 40%)
      expect(ranked[3].ranking.tier).toBe("average");
      expect(ranked[4].ranking.tier).toBe("average");
      expect(ranked[5].ranking.tier).toBe("average");
      expect(ranked[6].ranking.tier).toBe("average");
      // Positions 8-10 should be "low" (bottom 30%)
      expect(ranked[7].ranking.tier).toBe("low");
      expect(ranked[8].ranking.tier).toBe("low");
      expect(ranked[9].ranking.tier).toBe("low");
    });

    it("filters by category", () => {
      const deals = [
        createMockDeal("1", {
          metadata: {
            category: ["finance"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.9,
            status: "active",
          },
        }),
        createMockDeal("2", {
          metadata: {
            category: ["travel"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.5,
            status: "active",
          },
        }),
        createMockDeal("3", {
          metadata: {
            category: ["finance"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.7,
            status: "active",
          },
        }),
      ];

      const options: RankingOptions = {
        sortBy: "confidence",
        order: "desc",
        category: "finance",
      };

      const ranked = rankDeals(deals, options);
      expect(ranked).toHaveLength(2);
      expect(ranked[0].id).toBe("1");
      expect(ranked[1].id).toBe("3");
    });

    it("filters by minConfidence", () => {
      const deals = [
        createMockDeal("1", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.9,
            status: "active",
          },
        }),
        createMockDeal("2", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.5,
            status: "active",
          },
        }),
        createMockDeal("3", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.3,
            status: "active",
          },
        }),
      ];

      const options: RankingOptions = {
        sortBy: "confidence",
        order: "desc",
        minConfidence: 0.6,
      };

      const ranked = rankDeals(deals, options);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe("1");
    });

    it("filters by maxAge", () => {
      const now = new Date();
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      const deals = [
        createMockDeal("1", {}, now.toISOString()),
        createMockDeal("2", {}, oldDate.toISOString()),
      ];

      const options: RankingOptions = {
        sortBy: "confidence",
        order: "desc",
        maxAge: 5,
      };

      const ranked = rankDeals(deals, options);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe("1");
    });

    it("sorts by trust score", () => {
      const deals = [
        createMockDeal("1", {
          source: {
            url: "https://example.com",
            domain: "example.com",
            discovered_at: new Date().toISOString(),
            trust_score: 0.3,
          },
        }),
        createMockDeal("2", {
          source: {
            url: "https://example.com",
            domain: "example.com",
            discovered_at: new Date().toISOString(),
            trust_score: 0.9,
          },
        }),
      ];

      const options: RankingOptions = {
        sortBy: "trust",
        order: "desc",
      };

      const ranked = rankDeals(deals, options);
      expect(ranked[0].id).toBe("2");
      expect(ranked[1].id).toBe("1");
    });

    it("sorts by expiry confidence", () => {
      const deals = [
        createMockDeal("1", {
          expiry: { confidence: 0.3, type: "soft" },
        }),
        createMockDeal("2", {
          expiry: { confidence: 0.9, type: "soft" },
        }),
      ];

      const options: RankingOptions = {
        sortBy: "expiry",
        order: "desc",
      };

      const ranked = rankDeals(deals, options);
      expect(ranked[0].id).toBe("2");
      expect(ranked[1].id).toBe("1");
    });
  });

  describe("getTopDeals", () => {
    it("returns top N deals", () => {
      const deals = Array.from({ length: 20 }, (_, i) =>
        createMockDeal(String(i + 1), {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: i * 0.05,
            status: "active",
          },
        }),
      );

      const topDeals = getTopDeals(deals, 5);
      expect(topDeals).toHaveLength(5);
      expect(topDeals[0].ranking.position).toBe(1);
      expect(topDeals[4].ranking.position).toBe(5);
    });

    it("respects minConfidence filter", () => {
      const deals = [
        createMockDeal("1", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.9,
            status: "active",
          },
        }),
        createMockDeal("2", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.5,
            status: "active",
          },
        }),
        createMockDeal("3", {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.3,
            status: "active",
          },
        }),
      ];

      const topDeals = getTopDeals(deals, 10, 0.6);
      expect(topDeals).toHaveLength(1);
      expect(topDeals[0].id).toBe("1");
    });
  });

  describe("getDealsByTier", () => {
    it("returns deals for specified tier", () => {
      const deals = Array.from({ length: 10 }, (_, i) =>
        createMockDeal(String(i + 1), {
          metadata: {
            category: ["test"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: i * 0.1,
            status: "active",
          },
        }),
      );

      const topDeals = getDealsByTier(deals, "top");
      expect(topDeals.length).toBeGreaterThanOrEqual(1);
      expect(topDeals.every((d) => d.ranking.tier === "top")).toBe(true);

      const goodDeals = getDealsByTier(deals, "good");
      expect(goodDeals.every((d) => d.ranking.tier === "good")).toBe(true);
    });

    it("applies category filter", () => {
      const deals = [
        createMockDeal("1", {
          metadata: {
            category: ["finance"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.9,
            status: "active",
          },
        }),
        createMockDeal("2", {
          metadata: {
            category: ["travel"],
            tags: [],
            normalized_at: new Date().toISOString(),
            confidence_score: 0.95,
            status: "active",
          },
        }),
      ];

      const financeDeals = getDealsByTier(deals, "top", {
        category: "finance",
      });
      expect(financeDeals).toHaveLength(1);
      expect(financeDeals[0].id).toBe("1");
    });
  });
});
