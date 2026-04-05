import { describe, it, expect } from "vitest";
import type { Deal } from "../../../worker/types";
import { calculateCategoryScores } from "../../../worker/lib/categorization/scoring";

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

describe("Category Scoring", () => {
  describe("calculateCategoryScores", () => {
    it("should return empty map for deal with no matches", () => {
      const deal = createMockDeal({
        title: "Random item abc",
        description: "No matching keywords here xyz",
        code: "XYZ",
        source: {
          domain: "obscure-site.xyz",
          url: "https://obscure-site.xyz/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.3,
        },
      });

      const scores = calculateCategoryScores(deal);
      expect(scores.size).toBe(0);
    });

    it("should give high score for exact domain match", () => {
      const deal = createMockDeal({
        source: {
          domain: "robinhood.com",
          url: "https://robinhood.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.8,
        },
        title: "Free stock",
        description: "Open account",
        code: "STOCK",
      });

      const scores = calculateCategoryScores(deal);
      const financeScore = scores.get("finance");
      expect(financeScore).toBeGreaterThan(10); // Domain bonus = 10
    });

    it("should score based on keyword matches", () => {
      const deal = createMockDeal({
        title: "Best hotel booking for your vacation trip",
        description: "Find accommodation at great resorts and airlines",
        code: "TRAVEL",
      });

      const scores = calculateCategoryScores(deal);
      const travelScore = scores.get("travel");
      expect(travelScore).toBeGreaterThan(0);
    });

    it("should give code relevance bonus", () => {
      const deal = createMockDeal({
        title: "Some deal",
        description: "Some description",
        code: "FINANCEBONUS",
      });

      const scores = calculateCategoryScores(deal);
      const financeScore = scores.get("finance");
      expect(financeScore).toBeGreaterThan(0);
    });

    it("should return scores as a Map", () => {
      const deal = createMockDeal({
        source: {
          domain: "amazon.com",
          url: "https://amazon.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.9,
        },
        title: "Shop and save with discount coupons",
        description: "Buy items on sale",
        code: "SAVE10",
      });

      const scores = calculateCategoryScores(deal);
      expect(scores instanceof Map).toBe(true);
    });

    it("should not include categories with zero score", () => {
      const deal = createMockDeal({
        source: {
          domain: "robinhood.com",
          url: "https://robinhood.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.8,
        },
        title: "Invest in stocks",
        description: "Start trading today",
        code: "STOCK",
      });

      const scores = calculateCategoryScores(deal);
      scores.forEach((score) => {
        expect(score).toBeGreaterThan(0);
      });
    });

    it("should handle case-insensitive matching", () => {
      const deal = createMockDeal({
        title: "BANK Account with CASHBACK rewards",
        description: "INVESTING made easy",
        code: "BANK",
      });

      const scores = calculateCategoryScores(deal);
      const financeScore = scores.get("finance");
      expect(financeScore).toBeGreaterThan(0);
    });

    it("should score multiple categories for multi-topic deals", () => {
      const deal = createMockDeal({
        source: {
          domain: "amazon.com",
          url: "https://amazon.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.9,
        },
        title: "Shop for software tools and apps",
        description: "Buy applications and SaaS products on sale",
        code: "SHOPAPP",
      });

      const scores = calculateCategoryScores(deal);
      expect(scores.has("shopping")).toBe(true);
      expect(scores.has("software")).toBe(true);
    });

    it("should handle deals with empty title and description", () => {
      const deal = createMockDeal({
        title: "",
        description: "",
        code: "CODE",
      });

      const scores = calculateCategoryScores(deal);
      expect(scores instanceof Map).toBe(true);
    });

    it("should handle deals with very long descriptions", () => {
      const longDesc = "hotel ".repeat(1000);
      const deal = createMockDeal({
        title: "Travel deal",
        description: longDesc,
        code: "TRAVEL",
      });

      const scores = calculateCategoryScores(deal);
      const travelScore = scores.get("travel");
      expect(travelScore).toBeGreaterThan(0);
    });

    it("should score domain partial matches", () => {
      const deal = createMockDeal({
        source: {
          domain: "sub.robinhood.com",
          url: "https://sub.robinhood.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.8,
        },
        title: "Investment deal",
        description: "Trading platform",
        code: "INVEST",
      });

      const scores = calculateCategoryScores(deal);
      const financeScore = scores.get("finance");
      expect(financeScore).toBeGreaterThanOrEqual(10);
    });

    it("should give consistent scores for identical deals", () => {
      const deal = createMockDeal({
        source: {
          domain: "netflix.com",
          url: "https://netflix.com/ref",
          discovered_at: "2024-03-31T00:00:00Z",
          trust_score: 0.8,
        },
        title: "Streaming subscription",
        description: "Watch movies and shows",
        code: "STREAM",
      });

      const scores1 = calculateCategoryScores(deal);
      const scores2 = calculateCategoryScores(deal);

      expect(scores1.get("entertainment")).toBe(scores2.get("entertainment"));
    });
  });
});
