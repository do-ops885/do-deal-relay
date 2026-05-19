import { describe, it, expect, vi } from "vitest";
import {
  calculateAdaptiveBudget,
  buildDeal,
  extractTitle,
  extractDescription,
  parseHTMLContent,
  parseJSONContent
} from "../../worker/pipeline/discovery-utils";

describe("discovery-utils", () => {
  const mockSource = {
    domain: "test.com",
    trust_initial: 0.8,
    validation_success_count: 10,
    validation_failure_count: 2,
    discovery_count: 15,
  } as any;

  describe("calculateAdaptiveBudget", () => {
    it("should calculate budget with bonuses", () => {
      const budget = calculateAdaptiveBudget(mockSource, 100, 50);
      // Base 100 + Trust 50 + High Validation (10/12 > 0.8) 50 + Maturity 20 = 220
      expect(budget).toBeGreaterThan(150);
    });

    it("should apply penalty for low success rate", () => {
      const lowSource = {
        ...mockSource,
        validation_success_count: 1,
        validation_failure_count: 10,
      } as any;
      const budget = calculateAdaptiveBudget(lowSource, 100, 50);
      expect(budget).toBeLessThan(150);
    });
  });

  describe("buildDeal", () => {
    it("should build a valid deal object", async () => {
      const extracted = {
        code: "TEST1234",
        url: "https://test.com/ref",
        title: "Test",
        description: "Desc",
        reward_type: "cash",
        reward_value: 50,
      };
      const deal = await buildDeal(extracted, mockSource);
      expect(deal.id).toBeDefined();
      expect(deal.code).toBe("TEST1234");
      expect(deal.reward.value).toBe(50);
    });
  });

  describe("extractTitle", () => {
    it("should extract title from HTML", () => {
      const content = "<html><title>Special Offer</title><body>TITLECODE</body></html>";
      expect(extractTitle(content, "TITLECODE")).toBe("Special Offer");
    });

    it("should fallback to h1", () => {
      const content = "<html><h1>Big Discount</h1><body>H1CODE</body></html>";
      expect(extractTitle(content, "H1CODE")).toBe("Big Discount");
    });
  });

  describe("extractDescription", () => {
    it("should extract description from meta", () => {
      const content = '<html><meta name="description" content="Save money now"><body>DESCCODE</body></html>';
      expect(extractDescription(content, "DESCCODE")).toBe("Save money now");
    });
  });

  describe("parseHTMLContent", () => {
    it("should find codes in HTML", () => {
      const content = "Get bonus with referral_code: 'ABCDEF12'";
      const deals = parseHTMLContent(content, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0].code).toBe("ABCDEF12");
    });
  });

  describe("parseJSONContent", () => {
    it("should parse JSON array", () => {
      const content = JSON.stringify([
        { code: "JSON123", title: "Deal 1" }
      ]);
      const deals = parseJSONContent(content, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0].code).toBe("JSON123");
    });

    it("should parse wrapped JSON object", () => {
      const content = JSON.stringify({
        items: [{ code: "WRAPPED", title: "Deal 2" }]
      });
      const deals = parseJSONContent(content, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0].code).toBe("WRAPPED");
    });
  });
});
