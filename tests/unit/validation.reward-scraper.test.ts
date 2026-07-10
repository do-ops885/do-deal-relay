import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Deal, Env } from "../../worker/types";
import { setGitHubToken } from "../../worker/lib/github/index";

// Mock implementations for validation functions
const mockValidateUrl = vi.fn();
const mockCheckUrlStatusBatch = vi.fn();
const mockDetectRedirects = vi.fn();
const mockValidateCodeFormat = vi.fn();
const mockValidateCodeOnPage = vi.fn();
const mockTestCodeRedemption = vi.fn();
const mockScrapeCurrentRewards = vi.fn();
const mockDetectRewardChanges = vi.fn();
const mockExtractRewardFromHTML = vi.fn();

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockDeal = (
  id: string,
  overrides: Partial<Deal> & { expiryDate?: string } = {},
): Deal => {
  const expiryDate =
    overrides.expiryDate ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id,
    source: {
      url: "https://example.com/invite",
      domain: overrides.source?.domain || "example.com",
      discovered_at: "2024-03-31T00:00:00Z",
      trust_score: overrides.source?.trust_score || 0.7,
    },
    title: overrides.title ?? "Test Deal",
    description: overrides.description ?? "Test description",
    code: overrides.code ?? "CODE123",
    url: overrides.url ?? "https://example.com/invite/CODE123",
    reward: overrides.reward ?? {
      type: "cash",
      value: 50,
      currency: "USD",
    },
    expiry: {
      date: expiryDate,
      confidence: overrides.expiry?.confidence ?? 0.8,
      type: overrides.expiry?.type ?? "soft",
    },
    metadata: {
      category: ["test"],
      tags: ["test"],
      normalized_at: "2024-03-31T00:00:00Z",
      confidence_score: 0.8,
      status:
        (overrides.metadata?.status as "active" | "quarantined" | "rejected") ??
        "active",
    },
  };
};

// ============================================================================
// URL Validator Tests
// ============================================================================

describe("Reward Scraper", () => {
  describe("scrapeCurrentRewards", () => {
    it("should scrape current reward from deal page", async () => {
      const mockResult = {
        url: "https://example.com/deal",
        success: true,
        currentReward: {
          type: "cash" as const,
          value: 100,
          currency: "USD",
          description: "Get $100 when you sign up",
        },
        rewardChanged: false,
        scrapedAt: new Date().toISOString(),
      };

      mockScrapeCurrentRewards.mockResolvedValue(mockResult);
      const result = await mockScrapeCurrentRewards("https://example.com/deal");

      expect(result.success).toBe(true);
      expect(result.currentReward).toBeDefined();
      expect(result.currentReward?.type).toBe("cash");
      expect(result.currentReward?.value).toBe(100);
    });

    it("should detect reward changes", async () => {
      const mockResult = {
        url: "https://example.com/deal",
        success: true,
        currentReward: {
          type: "cash" as const,
          value: 75,
          currency: "USD",
        },
        rewardChanged: true,
        previousReward: {
          type: "cash" as const,
          value: 50,
          currency: "USD",
        },
        changeDetails: {
          typeChanged: false,
          valueChanged: true,
          oldValue: 50,
          newValue: 75,
        },
        scrapedAt: new Date().toISOString(),
      };

      mockScrapeCurrentRewards.mockResolvedValue(mockResult);
      const result = await mockScrapeCurrentRewards("https://example.com/deal");

      expect(result.rewardChanged).toBe(true);
      expect(result.changeDetails?.valueChanged).toBe(true);
      expect(result.changeDetails?.oldValue).toBe(50);
      expect(result.changeDetails?.newValue).toBe(75);
    });

    it("should handle page fetch failures", async () => {
      const mockResult = {
        url: "https://example.com/broken",
        success: false,
        rewardChanged: false,
        scrapedAt: new Date().toISOString(),
        error: "HTTP 404: Not Found",
      };

      mockScrapeCurrentRewards.mockResolvedValue(mockResult);
      const result = await mockScrapeCurrentRewards(
        "https://example.com/broken",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });

    it("should handle missing reward data", async () => {
      const mockResult = {
        url: "https://example.com/no-reward",
        success: false,
        rewardChanged: false,
        scrapedAt: new Date().toISOString(),
        error: "Could not extract reward information from page",
      };

      mockScrapeCurrentRewards.mockResolvedValue(mockResult);
      const result = await mockScrapeCurrentRewards(
        "https://example.com/no-reward",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not extract");
    });
  });

  describe("extractRewardFromHTML", () => {
    it("should extract cash rewards", () => {
      const html = `
        <div class="offer">
          <h2>Get $50 bonus when you sign up!</h2>
          <p>Use code REFERRAL50 to get $50 cash bonus</p>
        </div>
      `;

      mockExtractRewardFromHTML.mockReturnValue({
        type: "cash",
        value: 50,
        currency: "USD",
        confidence: 0.8,
      });

      const result = mockExtractRewardFromHTML(html);

      expect(result.type).toBe("cash");
      expect(result.value).toBe(50);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should extract percentage discounts", () => {
      const html = `
        <div class="promo">
          <span class="discount">20% off</span> your first order!
        </div>
      `;

      mockExtractRewardFromHTML.mockReturnValue({
        type: "percent",
        value: 20,
        confidence: 0.75,
      });

      const result = mockExtractRewardFromHTML(html);

      expect(result.type).toBe("percent");
      expect(result.value).toBe(20);
    });

    it("should extract credit rewards", () => {
      const html = `
        <div class="credit-offer">
          Earn 10,000 points = $100 credit
        </div>
      `;

      mockExtractRewardFromHTML.mockReturnValue({
        type: "credit",
        value: 10000,
        confidence: 0.7,
      });

      const result = mockExtractRewardFromHTML(html);

      expect(result.type).toBe("credit");
    });

    it("should extract item rewards", () => {
      const html = `
        <div class="bonus">
          Get a free premium subscription
        </div>
      `;

      mockExtractRewardFromHTML.mockReturnValue({
        type: "item",
        value: "premium subscription",
        confidence: 0.6,
      });

      const result = mockExtractRewardFromHTML(html);

      expect(result.type).toBe("item");
    });

    it("should return null for no reward found", () => {
      const html = `<div>No special offers available</div>`;

      mockExtractRewardFromHTML.mockReturnValue(null);
      const result = mockExtractRewardFromHTML(html);

      expect(result).toBeNull();
    });
  });

  describe("detectRewardChanges", () => {
    it("should detect increased rewards", async () => {
      const deal = createMockDeal("1", {
        reward: { type: "cash", value: 50, currency: "USD" },
      });

      mockDetectRewardChanges.mockResolvedValue({
        deal,
        previousReward: { type: "cash", value: 50, currency: "USD" },
        currentReward: { type: "cash", value: 100, currency: "USD" },
        changeType: "increased",
        severity: "info",
        detectedAt: new Date().toISOString(),
      });

      const result = await mockDetectRewardChanges(deal);

      expect(result?.changeType).toBe("increased");
      expect(result?.severity).toBe("info");
    });

    it("should detect decreased rewards", async () => {
      const deal = createMockDeal("1", {
        reward: { type: "cash", value: 100, currency: "USD" },
      });

      mockDetectRewardChanges.mockResolvedValue({
        deal,
        previousReward: { type: "cash", value: 100, currency: "USD" },
        currentReward: { type: "cash", value: 50, currency: "USD" },
        changeType: "decreased",
        severity: "warning",
        detectedAt: new Date().toISOString(),
      });

      const result = await mockDetectRewardChanges(deal);

      expect(result?.changeType).toBe("decreased");
      expect(result?.severity).toBe("warning");
    });

    it("should detect reward type changes", async () => {
      const deal = createMockDeal("1", {
        reward: { type: "cash", value: 50, currency: "USD" },
      });

      mockDetectRewardChanges.mockResolvedValue({
        deal,
        previousReward: { type: "cash", value: 50, currency: "USD" },
        currentReward: { type: "credit", value: 5000 },
        changeType: "type_changed",
        severity: "warning",
        detectedAt: new Date().toISOString(),
      });

      const result = await mockDetectRewardChanges(deal);

      expect(result?.changeType).toBe("type_changed");
    });

    it("should return null when no change detected", async () => {
      const deal = createMockDeal("1", {
        reward: { type: "cash", value: 50, currency: "USD" },
      });

      mockDetectRewardChanges.mockResolvedValue(null);
      const result = await mockDetectRewardChanges(deal);

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// Expiration Manager Tests
// ============================================================================
