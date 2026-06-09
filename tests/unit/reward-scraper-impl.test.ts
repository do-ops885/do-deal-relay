import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  scrapeCurrentRewards,
  extractRewardFromHTML,
  detectRewardChanges,
  batchScrapeRewards,
  getScrapingStats,
} from "../../worker/lib/validation/reward-scraper";
import { logger } from "../../worker/lib/global-logger";

vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../worker/lib/security", () => ({
  validateUrl: vi.fn().mockReturnValue(true),
  validateFetchUrl: vi.fn().mockResolvedValue(true),
  validatedFetch: vi
    .fn()
    .mockImplementation((url: string, init?: RequestInit) =>
      global.fetch(url, init),
    ),
  validateReferralUrl: vi.fn().mockReturnValue(true),
}));

// Mock fetch
const globalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

afterAll(() => {
  global.fetch = globalFetch;
});

describe("reward-scraper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractRewardFromHTML", () => {
    it("should extract cash rewards", () => {
      const html = "<div>Get $50 bonus when you sign up!</div>";
      const result = extractRewardFromHTML(html);
      expect(result?.type).toBe("cash");
      expect(result?.value).toBe(50);
      expect(result?.currency).toBe("USD");
    });

    it("should extract percentage rewards", () => {
      const html = "<div>Save 20% on your first order</div>";
      const result = extractRewardFromHTML(html);
      expect(result?.type).toBe("percent");
      expect(result?.value).toBe(20);
    });

    it("should extract credit rewards", () => {
      const html = "<div>Total of 1,000 credits available</div>";
      const result = extractRewardFromHTML(html);
      expect(result?.type).toBe("credit");
      expect(result?.value).toBe(1000);
    });

    it("should extract item rewards", () => {
      const html = "<div>Get a month of Premium as a bonus</div>";
      const result = extractRewardFromHTML(html);
      expect(result?.type).toBe("item");
      expect(
        typeof result?.value === "string" ? result.value.toLowerCase() : "",
      ).toContain("month of premium");
    });

    it("should handle structured data (JSON-LD)", () => {
      const html = `
        <script type="application/ld+json">
          {
            "@type": "Offer",
            "price": "75.00",
            "priceCurrency": "USD"
          }
        </script>
      `;
      const result = extractRewardFromHTML(html);
      expect(result?.type).toBe("cash");
      expect(result?.value).toBe(75);
      expect(result?.currency).toBe("USD");
    });
  });

  describe("scrapeCurrentRewards", () => {
    it("should scrape successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<div>Get $50 bonus</div>",
      });

      const result = await scrapeCurrentRewards("https://example.com/deal");
      expect(result.success).toBe(true);
      expect(result.currentReward?.value).toBe(50);
    });

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await scrapeCurrentRewards("https://example.com/deal");
      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });
  });

  describe("detectRewardChanges", () => {
    it("should detect increased reward", async () => {
      const deal = {
        id: "1",
        url: "https://example.com/deal",
        reward: { type: "cash", value: 50, currency: "USD" },
      } as any;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<div>Get $100 bonus</div>",
      });

      const result = await detectRewardChanges(deal);
      expect(result?.changeType).toBe("increased");
      expect(result?.currentReward.value).toBe(100);
    });

    it("should return null if no change", async () => {
      const deal = {
        id: "1",
        url: "https://example.com/deal",
        reward: { type: "cash", value: 50, currency: "USD" },
      } as any;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<div>Get $50 bonus</div>",
      });

      const result = await detectRewardChanges(deal);
      expect(result).toBeNull();
    });
  });

  describe("getScrapingStats", () => {
    it("should return correct stats", () => {
      const results = [
        {
          success: true,
          rewardChanged: true,
          currentReward: { value: 100 },
          previousReward: { value: 50 },
          changeDetails: { valueChanged: true },
        },
        { success: true, rewardChanged: false },
        { success: false },
      ] as any[];

      const stats = getScrapingStats(results);
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.withChanges).toBe(1);
      expect(stats.increased).toBe(1);
    });
  });
});
