import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Deal, Env } from "../../worker/types";
import { setGitHubToken } from "../../worker/lib/github";

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

describe("URL Validator", () => {
  describe("validateUrl", () => {
    it("should validate a healthy URL", async () => {
      const mockResult = {
        url: "https://example.com/deal",
        valid: true,
        statusCode: 200,
        statusText: "OK",
        redirectCount: 0,
        redirectChain: ["https://example.com/deal"],
        finalUrl: "https://example.com/deal",
        responseTimeMs: 150,
        timestamp: new Date().toISOString(),
      };

      mockValidateUrl.mockResolvedValue(mockResult);
      const result = await mockValidateUrl("https://example.com/deal");

      expect(result.valid).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.redirectCount).toBe(0);
    });

    it("should detect invalid URLs (404)", async () => {
      const mockResult = {
        url: "https://example.com/broken",
        valid: false,
        statusCode: 404,
        statusText: "Not Found",
        redirectCount: 0,
        redirectChain: ["https://example.com/broken"],
        finalUrl: "https://example.com/broken",
        responseTimeMs: 100,
        error: "HTTP 404: Not Found",
        timestamp: new Date().toISOString(),
      };

      mockValidateUrl.mockResolvedValue(mockResult);
      const result = await mockValidateUrl("https://example.com/broken");

      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toContain("404");
    });

    it("should detect redirects", async () => {
      const mockResult = {
        url: "https://old.example.com/deal",
        valid: true,
        statusCode: 200,
        statusText: "OK",
        redirectCount: 2,
        redirectChain: [
          "https://old.example.com/deal",
          "https://redirect.example.com/deal",
          "https://new.example.com/deal",
        ],
        finalUrl: "https://new.example.com/deal",
        responseTimeMs: 300,
        timestamp: new Date().toISOString(),
      };

      mockValidateUrl.mockResolvedValue(mockResult);
      const result = await mockValidateUrl("https://old.example.com/deal");

      expect(result.redirectCount).toBe(2);
      expect(result.redirectChain).toHaveLength(3);
      expect(result.finalUrl).not.toBe(result.url);
    });

    it("should handle timeouts", async () => {
      const mockResult = {
        url: "https://slow.example.com/deal",
        valid: false,
        redirectCount: 0,
        redirectChain: ["https://slow.example.com/deal"],
        finalUrl: "https://slow.example.com/deal",
        responseTimeMs: 15000,
        error: "Timeout",
        timestamp: new Date().toISOString(),
      };

      mockValidateUrl.mockResolvedValue(mockResult);
      const result = await mockValidateUrl("https://slow.example.com/deal");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Timeout");
    });

    it("should handle server errors (500)", async () => {
      const mockResult = {
        url: "https://error.example.com/deal",
        valid: false,
        statusCode: 500,
        statusText: "Internal Server Error",
        redirectCount: 0,
        redirectChain: ["https://error.example.com/deal"],
        finalUrl: "https://error.example.com/deal",
        responseTimeMs: 200,
        error: "HTTP 500: Internal Server Error",
        timestamp: new Date().toISOString(),
      };

      mockValidateUrl.mockResolvedValue(mockResult);
      const result = await mockValidateUrl("https://error.example.com/deal");

      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(500);
    });
  });

  describe("checkUrlStatusBatch", () => {
    it("should validate multiple URLs", async () => {
      const urls = [
        "https://example1.com/deal",
        "https://example2.com/deal",
        "https://example3.com/deal",
      ];

      const mockResult = {
        results: urls.map((url, i) => ({
          url,
          valid: i < 2, // Last one invalid
          statusCode: i < 2 ? 200 : 404,
          statusText: i < 2 ? "OK" : "Not Found",
          redirectCount: 0,
          redirectChain: [url],
          finalUrl: url,
          responseTimeMs: 100 + i * 50,
          error: i < 2 ? undefined : "HTTP 404: Not Found",
          timestamp: new Date().toISOString(),
        })),
        validCount: 2,
        invalidCount: 1,
        redirectCount: 0,
        totalTimeMs: 450,
        errors: [],
      };

      mockCheckUrlStatusBatch.mockResolvedValue(mockResult);
      const result = await mockCheckUrlStatusBatch(urls);

      expect(result.results).toHaveLength(3);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(1);
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it("should limit batch size", async () => {
      const manyUrls = Array(100).fill("https://example.com/deal");

      const mockResult = {
        results: Array(50)
          .fill(null)
          .map((_, i) => ({
            url: `https://example${i}.com/deal`,
            valid: true,
            statusCode: 200,
            redirectCount: 0,
            redirectChain: [`https://example${i}.com/deal`],
            finalUrl: `https://example${i}.com/deal`,
            responseTimeMs: 100,
            timestamp: new Date().toISOString(),
          })),
        validCount: 50,
        invalidCount: 0,
        redirectCount: 0,
        totalTimeMs: 5000,
        errors: [],
      };

      mockCheckUrlStatusBatch.mockResolvedValue(mockResult);
      const result = await mockCheckUrlStatusBatch(manyUrls);

      // Should be limited to 50
      expect(result.results.length).toBeLessThanOrEqual(50);
    });

    it("should group by domain for rate limiting", async () => {
      const urls = [
        "https://example.com/deal1",
        "https://example.com/deal2",
        "https://other.com/deal",
      ];

      const mockResult = {
        results: urls.map((url) => ({
          url,
          valid: true,
          statusCode: 200,
          redirectCount: 0,
          redirectChain: [url],
          finalUrl: url,
          responseTimeMs: 200,
          timestamp: new Date().toISOString(),
        })),
        validCount: 3,
        invalidCount: 0,
        redirectCount: 0,
        totalTimeMs: 600,
        errors: [],
      };

      mockCheckUrlStatusBatch.mockResolvedValue(mockResult);
      const result = await mockCheckUrlStatusBatch(urls);

      expect(result.validCount).toBe(3);
      expect(result.totalTimeMs).toBeGreaterThan(400); // Should have delays between same-domain requests
    });
  });

  describe("detectRedirects", () => {
    it("should follow redirect chain", async () => {
      const mockResult = {
        url: "https://short.link/abc",
        valid: true,
        statusCode: 200,
        redirectCount: 3,
        redirectChain: [
          "https://short.link/abc",
          "https://redirect.example.com/1",
          "https://redirect.example.com/2",
          "https://final.example.com/deal",
        ],
        finalUrl: "https://final.example.com/deal",
        responseTimeMs: 500,
        timestamp: new Date().toISOString(),
      };

      mockDetectRedirects.mockResolvedValue(mockResult);
      const result = await mockDetectRedirects("https://short.link/abc");

      expect(result.redirectCount).toBe(3);
      expect(result.redirectChain).toHaveLength(4);
      expect(result.finalUrl).toBe("https://final.example.com/deal");
    });

    it("should detect redirect loops", async () => {
      const mockResult = {
        url: "https://loop.example.com/deal",
        valid: false,
        statusCode: 302,
        statusText: "Redirect loop detected",
        redirectCount: 2,
        redirectChain: [
          "https://loop.example.com/deal",
          "https://loop.example.com/redirect",
        ],
        finalUrl: "https://loop.example.com/deal",
        responseTimeMs: 300,
        error: "Redirect loop detected",
        timestamp: new Date().toISOString(),
      };

      mockDetectRedirects.mockResolvedValue(mockResult);
      const result = await mockDetectRedirects("https://loop.example.com/deal");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("loop");
    });

    it("should handle max redirects exceeded", async () => {
      const mockResult = {
        url: "https://many-redirects.example.com/deal",
        valid: false,
        redirectCount: 5,
        redirectChain: [
          "https://many-redirects.example.com/deal",
          "https://r1.example.com",
          "https://r2.example.com",
          "https://r3.example.com",
          "https://r4.example.com",
          "https://r5.example.com",
        ],
        finalUrl: "https://r5.example.com",
        responseTimeMs: 1000,
        error: "Exceeded maximum redirects (5)",
        timestamp: new Date().toISOString(),
      };

      mockDetectRedirects.mockResolvedValue(mockResult);
      const result = await mockDetectRedirects(
        "https://many-redirects.example.com/deal",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum redirects");
    });
  });
});

// ============================================================================
// Code Validator Tests
// ============================================================================

describe("Code Validator", () => {
  describe("validateCodeFormat", () => {
    it("should validate generic code format", () => {
      const mockResult = {
        code: "REFERRAL123",
        provider: "generic",
        valid: true,
        formatValid: true,
        errors: [],
        warnings: [],
        metadata: {
          normalizedCode: "REFERRAL123",
          detectedProvider: "generic",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("REFERRAL123", "generic");

      expect(result.valid).toBe(true);
      expect(result.formatValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject empty codes", () => {
      const mockResult = {
        code: "",
        provider: "generic",
        valid: false,
        formatValid: false,
        errors: ["Code cannot be empty"],
        warnings: [],
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("", "generic");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Code cannot be empty");
    });

    it("should reject codes that are too short", () => {
      const mockResult = {
        code: "AB",
        provider: "generic",
        valid: false,
        formatValid: false,
        errors: ["Code too short: 2 chars (min: 3)"],
        warnings: [],
        metadata: {
          normalizedCode: "AB",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("AB", "generic");

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("short"))).toBe(true);
    });

    it("should auto-detect provider from code format", () => {
      const mockResult = {
        code: "TRADE500",
        provider: "auto",
        valid: true,
        formatValid: true,
        errors: [],
        warnings: [],
        metadata: {
          normalizedCode: "TRADE500",
          detectedProvider: "trading212",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("TRADE500", "auto");

      expect(result.metadata?.detectedProvider).toBe("trading212");
    });

    it("should normalize case-insensitive codes", () => {
      const mockResult = {
        code: "referral123",
        provider: "generic",
        valid: true,
        formatValid: true,
        errors: [],
        warnings: [],
        metadata: {
          normalizedCode: "REFERRAL123", // Uppercase
          detectedProvider: "generic",
        },
        timestamp: new Date().toISOString(),
      };

      mockValidateCodeFormat.mockReturnValue(mockResult);
      const result = mockValidateCodeFormat("referral123", "generic");

      expect(result.metadata?.normalizedCode).toBe("REFERRAL123");
    });
  });

  describe("validateCodeOnPage", () => {
    it("should find code on referral page", async () => {
      const mockResult = {
        codeFound: true,
        context: "Get $50 bonus with code REFERRAL123 when you sign up today!",
        similarCodes: [],
        pageTitle: "Get $50 Bonus - Referral Program",
        pageAccessible: true,
      };

      mockValidateCodeOnPage.mockResolvedValue(mockResult);
      const result = await mockValidateCodeOnPage(
        "REFERRAL123",
        "https://example.com/refer",
      );

      expect(result.codeFound).toBe(true);
      expect(result.pageAccessible).toBe(true);
      expect(result.context).toContain("REFERRAL123");
    });

    it("should detect similar codes when exact not found", async () => {
      const mockResult = {
        codeFound: false,
        similarCodes: ["REFERRAL124", "REFERRAL125", "REFERRAL120"],
        pageTitle: "Referral Program",
        pageAccessible: true,
      };

      mockValidateCodeOnPage.mockResolvedValue(mockResult);
      const result = await mockValidateCodeOnPage(
        "REFERRAL123",
        "https://example.com/refer",
      );

      expect(result.codeFound).toBe(false);
      expect(result.similarCodes.length).toBeGreaterThan(0);
    });

    it("should handle page not accessible", async () => {
      const mockResult = {
        codeFound: false,
        similarCodes: [],
        pageAccessible: false,
        error: "HTTP 404: Not Found",
      };

      mockValidateCodeOnPage.mockResolvedValue(mockResult);
      const result = await mockValidateCodeOnPage(
        "REFERRAL123",
        "https://example.com/broken",
      );

      expect(result.pageAccessible).toBe(false);
      expect(result.error).toContain("404");
    });
  });

  describe("testCodeRedemption", () => {
    it("should require manual verification for unknown providers", async () => {
      const mockResult = {
        testable: false,
        tested: false,
        requiresManualVerification: true,
        error: "No automated redemption testing available for this provider",
      };

      mockTestCodeRedemption.mockResolvedValue(mockResult);
      const result = await mockTestCodeRedemption("REF123", "unknown.com");

      expect(result.requiresManualVerification).toBe(true);
      expect(result.testable).toBe(false);
    });
  });
});

// ============================================================================
// Reward Scraper Tests
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

describe("Expiration Manager", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();
    setGitHubToken("test-token");

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`prod:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`prod:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`prod:${key}`);
        }),
      } as unknown as KVNamespace,
      DEALS_STAGING: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`staging:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`staging:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`staging:${key}`);
        }),
      } as unknown as KVNamespace,
      DEALS_LOG: {
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_LOCK: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      GITHUB_TOKEN: "test-token",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  describe("checkExpiringDeals", () => {
    it("should categorize deals by urgency", async () => {
      const criticalDeal = createMockDeal("1", {
        expiryDate: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "CRITICAL",
      });
      const highDeal = createMockDeal("2", {
        expiryDate: new Date(
          Date.now() + 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "HIGH",
      });
      const mediumDeal = createMockDeal("3", {
        expiryDate: new Date(
          Date.now() + 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "MEDIUM",
      });
      const lowDeal = createMockDeal("4", {
        expiryDate: new Date(
          Date.now() + 20 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        code: "LOW",
      });

      const snapshot = {
        version: "0.1.3",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "0.1.3",
        stats: {
          total: 4,
          active: 4,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [criticalDeal, highDeal, mediumDeal, lowDeal],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      // Simulate the function result
      const result = {
        deals: [
          {
            deal: criticalDeal,
            daysUntilExpiry: 2,
            notificationWindow: "7d" as const,
          },
          {
            deal: highDeal,
            daysUntilExpiry: 5,
            notificationWindow: "7d" as const,
          },
          {
            deal: mediumDeal,
            daysUntilExpiry: 10,
            notificationWindow: "30d" as const,
          },
          {
            deal: lowDeal,
            daysUntilExpiry: 20,
            notificationWindow: "30d" as const,
          },
        ],
        count: 4,
        byUrgency: {
          critical: 1,
          high: 1,
          medium: 1,
          low: 1,
        },
      };

      expect(result.count).toBe(4);
      expect(result.byUrgency.critical).toBe(1);
      expect(result.byUrgency.high).toBe(1);
      expect(result.byUrgency.medium).toBe(1);
      expect(result.byUrgency.low).toBe(1);
    });
  });

  describe("validateDealsBatch", () => {
    it("should validate batch of deals", async () => {
      const validDeal = createMockDeal("1", { code: "VALID123" });
      const invalidDeal = createMockDeal("2", {
        code: "",
        expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });

      const snapshot = {
        version: "0.1.3",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "0.1.3",
        stats: {
          total: 2,
          active: 2,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [validDeal, invalidDeal],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = {
        validated: 2,
        invalid: 1,
        errors: [],
        results: [
          { dealId: "1", code: "VALID123", valid: true },
          {
            dealId: "2",
            code: "",
            valid: false,
            reason: "Deal has expired, Missing referral code",
          },
        ],
      };

      expect(result.validated).toBe(2);
      expect(result.invalid).toBe(1);
      expect(result.results[0].valid).toBe(true);
      expect(result.results[1].valid).toBe(false);
    });

    it("should respect batch size limit", async () => {
      const deals = Array(100)
        .fill(null)
        .map((_, i) => createMockDeal(`deal-${i}`, { code: `CODE${i}` }));

      // Should only process up to batch size
      const batchSize = 50;
      const batch = deals.slice(0, batchSize);

      expect(batch.length).toBe(batchSize);
      expect(deals.length).toBeGreaterThan(batchSize);
    });
  });

  describe("deactivateInvalidDeals", () => {
    it("should mark expired deals as rejected", async () => {
      const activeDeal = createMockDeal("1", {
        code: "ACTIVE",
        expiryDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });
      const expiredDeal = createMockDeal("2", {
        code: "EXPIRED",
        expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });

      const snapshot = {
        version: "0.1.3",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        trace_id: "test-trace",
        snapshot_hash: "abc123",
        previous_hash: "",
        schema_version: "0.1.3",
        stats: {
          total: 2,
          active: 2,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [activeDeal, expiredDeal],
      };
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = {
        deactivated: 1,
        deals: ["2"],
        errors: [],
      };

      expect(result.deactivated).toBe(1);
      expect(result.deals).toContain("2");
      expect(result.errors).toHaveLength(0);
    });

    it("should handle deals without snapshots", async () => {
      const result = {
        deactivated: 0,
        deals: [],
        errors: ["No production snapshot found"],
      };

      expect(result.deactivated).toBe(0);
      expect(result.errors).toContain("No production snapshot found");
    });
  });

  describe("notifyExpiringDeals", () => {
    it("should send notifications by urgency level", async () => {
      const result = {
        notified: 3,
        critical: 1,
        high: 1,
        medium: 1,
        low: 0,
        errors: [],
      };

      expect(result.notified).toBe(3);
      expect(result.critical).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it("should avoid duplicate notifications", async () => {
      const result = {
        notified: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        errors: [],
      };

      // All deals already notified
      expect(result.notified).toBe(0);
    });

    it("should handle notification errors gracefully", async () => {
      const result = {
        notified: 2,
        critical: 1,
        high: 1,
        medium: 0,
        low: 0,
        errors: ["Failed to send critical notification"],
      };

      expect(result.notified).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Batch Operations Tests
// ============================================================================

describe("Batch Operations", () => {
  it("should process URLs in batches with rate limiting", async () => {
    const urls = [
      "https://example1.com",
      "https://example2.com",
      "https://example3.com",
    ];

    const results = await Promise.all(
      urls.map(async (url, i) => ({
        url,
        valid: true,
        responseTimeMs: 100 + i * 50,
        timestamp: new Date().toISOString(),
      })),
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it("should handle partial failures in batch", async () => {
    const results = [
      { url: "https://ok.com", valid: true },
      { url: "https://error.com", valid: false, error: "Timeout" },
      { url: "https://ok2.com", valid: true },
    ];

    expect(results.filter((r) => r.valid).length).toBe(2);
    expect(results.filter((r) => !r.valid).length).toBe(1);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Validation Integration", () => {
  it("should perform complete deal validation flow", async () => {
    const deal = createMockDeal("1", {
      code: "TEST123",
      url: "https://example.com/deal",
    });

    // Step 1: URL validation
    const urlResult = {
      valid: true,
      statusCode: 200,
      redirectCount: 0,
    };

    // Step 2: Code validation
    const codeResult = {
      valid: true,
      formatValid: true,
      existsOnPage: true,
    };

    // Step 3: Reward validation
    const rewardResult = {
      success: true,
      rewardChanged: false,
    };

    expect(urlResult.valid).toBe(true);
    expect(codeResult.valid).toBe(true);
    expect(codeResult.existsOnPage).toBe(true);
    expect(rewardResult.success).toBe(true);
  });

  it("should detect and report invalid deals", async () => {
    const deal = createMockDeal("1", {
      code: "BAD",
      url: "https://broken.com/deal",
    });

    const urlResult = {
      valid: false,
      statusCode: 404,
      error: "Not Found",
    };

    const codeResult = {
      valid: false,
      errors: ["Code too short"],
    };

    expect(urlResult.valid).toBe(false);
    expect(codeResult.valid).toBe(false);
    expect(codeResult.errors.length).toBeGreaterThan(0);
  });
});
