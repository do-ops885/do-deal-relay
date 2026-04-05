import { describe, it, expect } from "vitest";
import type { Deal } from "../../../worker/types";
import {
  calculateTagScores,
  TAG_DEFINITIONS,
} from "../../../worker/lib/categorization/scoring";

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

describe("Tag Scoring", () => {
  describe("calculateTagScores", () => {
    it("should return empty map for deal with no tag matches", () => {
      const deal = createMockDeal({
        title: "Some random deal",
        description: "Nothing special here",
        code: "XYZ",
        reward: { type: "cash", value: 5 },
      });

      const scores = calculateTagScores(deal);
      expect(scores.size).toBe(0);
    });

    it("should detect signup_bonus tag", () => {
      const deal = createMockDeal({
        title: "Sign up bonus for new account",
        description: "Welcome bonus for new users",
        code: "SIGNUP",
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("signup_bonus")).toBe(true);
      expect(scores.get("signup_bonus")).toBeGreaterThan(0);
    });

    it("should detect cashback tag", () => {
      const deal = createMockDeal({
        title: "Get cashback on purchases",
        description: "Earn percent back on every transaction",
        code: "CASH",
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("cashback")).toBe(true);
    });

    it("should detect crypto tag", () => {
      const deal = createMockDeal({
        title: "Bitcoin trading platform",
        description: "Buy ethereum and cryptocurrency with wallet",
        code: "CRYPTO",
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("crypto")).toBe(true);
    });

    it("should detect high_value tag for rewards >= 50", () => {
      const deal = createMockDeal({
        title: "Some deal",
        description: "Some description",
        code: "HIGH",
        reward: { type: "cash", value: 50 },
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("high_value")).toBe(true);
      expect(scores.get("high_value")).toBe(50);
    });

    it("should not detect high_value tag for rewards < 50", () => {
      const deal = createMockDeal({
        title: "Some deal",
        description: "Some description",
        code: "LOW",
        reward: { type: "cash", value: 25 },
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("high_value")).toBe(false);
    });

    it("should use reward value as high_value score", () => {
      const deal = createMockDeal({
        title: "Some deal",
        description: "Some description",
        code: "HIGH",
        reward: { type: "cash", value: 200 },
      });

      const scores = calculateTagScores(deal);
      expect(scores.get("high_value")).toBe(200);
    });

    it("should detect limited_time tag", () => {
      const deal = createMockDeal({
        title: "Limited time offer expires soon",
        description: "Deadline approaching while supplies last",
        code: "LIMITED",
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("limited_time")).toBe(true);
    });

    it("should detect recurring tag", () => {
      const deal = createMockDeal({
        title: "Monthly subscription plan",
        description: "Annual recurring payment per month",
        code: "SUB",
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("recurring")).toBe(true);
    });

    it("should detect stock_trading tag", () => {
      const deal = createMockDeal({
        title: "Commission free stock trading",
        description: "Trade shares and equity with no fees",
        code: "TRADE",
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("stock_trading")).toBe(true);
    });

    it("should handle non-numeric reward values", () => {
      const deal = createMockDeal({
        title: "Some deal",
        description: "Some description",
        code: "ITEM",
        reward: { type: "item", value: "free trial" },
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("high_value")).toBe(false);
    });

    it("should return scores as a Map", () => {
      const deal = createMockDeal({
        title: "Sign up for cashback rewards",
        description: "New account welcome bonus",
        code: "BONUS",
        reward: { type: "cash", value: 100 },
      });

      const scores = calculateTagScores(deal);
      expect(scores instanceof Map).toBe(true);
    });

    it("should handle case-insensitive tag matching", () => {
      const deal = createMockDeal({
        title: "SIGN UP for CASHBACK",
        description: "New Account with Welcome Bonus",
        code: "TAGS",
      });

      const scores = calculateTagScores(deal);
      expect(scores.has("signup_bonus")).toBe(true);
      expect(scores.has("cashback")).toBe(true);
    });

    it("should score multiple tags for multi-topic deals", () => {
      const deal = createMockDeal({
        title: "Sign up for crypto trading with cashback",
        description: "New user welcome bonus on bitcoin trades",
        code: "CRYPTO",
        reward: { type: "cash", value: 75 },
      });

      const scores = calculateTagScores(deal);
      expect(scores.size).toBeGreaterThanOrEqual(3);
      expect(scores.has("signup_bonus")).toBe(true);
      expect(scores.has("crypto")).toBe(true);
      expect(scores.has("high_value")).toBe(true);
    });
  });

  describe("TAG_DEFINITIONS structure", () => {
    it("should define all expected tags", () => {
      const expectedTags = [
        "signup_bonus",
        "cashback",
        "crypto",
        "stock_trading",
        "high_value",
        "limited_time",
        "recurring",
      ];

      expectedTags.forEach((tag) => {
        expect(TAG_DEFINITIONS[tag]).toBeDefined();
      });
    });

    it("should have valid structure for each tag", () => {
      Object.entries(TAG_DEFINITIONS).forEach(([name, def]) => {
        expect(Array.isArray(def.keywords)).toBe(true);
        expect(Array.isArray(def.relatedCategories)).toBe(true);
      });
    });

    it("should have correct number of tags", () => {
      expect(Object.keys(TAG_DEFINITIONS).length).toBe(7);
    });
  });
});
