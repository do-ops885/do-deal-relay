import { describe, it, expect } from "vitest";
import {
  normalizeResearchQuery,
  generateSearchQueries,
  generatePotentialCodes,
  extractRewardValue,
  getDefaultResearchConfig,
} from "../../worker/lib/research-agent/helpers";

describe("Research Agent Helpers", () => {
  describe("normalizeResearchQuery", () => {
    it("should lowercase and trim query", () => {
      const result = normalizeResearchQuery("  Trading212 Invite  ");
      expect(result).toBe("trading212 referral");
    });

    it("should prepend domain if missing from query", () => {
      const result = normalizeResearchQuery("invite code", "example.com");
      expect(result).toBe("example.com referral code");
    });

    it("should normalize terms (invite, promo, promotion)", () => {
      expect(normalizeResearchQuery("promo code")).toBe("referral code");
      expect(normalizeResearchQuery("promotion details")).toBe(
        "referral program details",
      );
    });
  });

  describe("generateSearchQueries", () => {
    it("should generate platform-specific search queries for producthunt", () => {
      const queries = generateSearchQueries("notion", "producthunt");
      expect(queries).toContain("notion referral");
      expect(queries).toContain("notion invite");
      expect(queries).toContain("notion promo code");
    });

    it("should generate platform-specific search queries for reddit", () => {
      const queries = generateSearchQueries("revolut", "reddit");
      expect(queries).toContain("revolut referral code");
      expect(queries).toContain("site:reddit.com revolut referral");
    });

    it("should fallback to query for unknown source", () => {
      const queries = generateSearchQueries("custom", "unknown_source");
      expect(queries).toEqual(["custom"]);
    });
  });

  describe("generatePotentialCodes", () => {
    it("should return empty array for domain without known program", () => {
      const codes = generatePotentialCodes("unknown-domain-123.com", "quick");
      expect(codes).toEqual([]);
    });

    it("should generate codes for known program according to depth", () => {
      const quickCodes = generatePotentialCodes("trading212.com", "quick");
      expect(quickCodes.length).toBe(3);

      const thoroughCodes = generatePotentialCodes(
        "trading212.com",
        "thorough",
      );
      expect(thoroughCodes.length).toBe(5);

      const deepCodes = generatePotentialCodes("trading212.com", "deep");
      expect(deepCodes.length).toBe(10);
    });
  });

  describe("extractRewardValue", () => {
    it("should return undefined for missing reward summary", () => {
      expect(extractRewardValue(undefined)).toBeUndefined();
      expect(extractRewardValue("No numeric value here")).toBeUndefined();
    });

    it("should parse dollar amounts correctly", () => {
      expect(extractRewardValue("$50 bonus")).toBe(50);
      expect(extractRewardValue("Earn $1,250.50 on signup")).toBe(1250.5);
    });

    it("should parse percentage discounts correctly", () => {
      expect(extractRewardValue("20% off first month")).toBe(20);
    });
  });

  describe("getDefaultResearchConfig", () => {
    it("should return valid default research configuration", () => {
      const config = getDefaultResearchConfig();
      expect(config.maxRequestsPerMinute).toBe(60);
      expect(config.circuitBreakerEnabled).toBe(true);
      expect(config.sourceWeights.producthunt).toBe(0.85);
    });
  });
});
