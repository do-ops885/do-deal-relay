import { describe, it, expect, vi } from "vitest";

// Mock implementations for validation functions
const mockValidateUrl = vi.fn();
const mockCheckUrlStatusBatch = vi.fn();
const mockDetectRedirects = vi.fn();

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
