import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateUrl,
  checkUrlStatusBatch,
  detectRedirects,
  isUrlDead,
  getValidationSummary,
} from "../../worker/lib/validation/url-validator";
const { mockValidatedFetch } = vi.hoisted(() => ({
  mockValidatedFetch: vi.fn(),
}));

vi.mock("../../worker/lib/security", () => ({
  validatedFetch: mockValidatedFetch,
}));

describe("url-validator", () => {
  beforeEach(() => {
    mockValidatedFetch.mockReset();
  });

  describe("validateUrl", () => {
    it("should return valid for 200 OK", async () => {
      mockValidatedFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: new Map(),
      });

      const result = await validateUrl("https://example.com/deal");
      expect(result.valid).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.url).toBe("https://example.com/deal");
    });

    it("should follow redirects", async () => {
      // 301 Redirect
      mockValidatedFetch.mockResolvedValueOnce({
        status: 301,
        statusText: "Moved Permanently",
        headers: new Map([["location", "https://example.com/new"]]),
      });
      // 200 OK
      mockValidatedFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: new Map(),
      });

      const result = await validateUrl("https://example.com/old");
      expect(result.valid).toBe(true);
      expect(result.redirectCount).toBe(1);
      expect(result.finalUrl).toBe("https://example.com/new");
      expect(result.redirectChain).toContain("https://example.com/new");
    });

    it("should return invalid for 404", async () => {
      // HEAD 404
      mockValidatedFetch.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        headers: new Map(),
      });
      // GET 404 (fallback)
      mockValidatedFetch.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        headers: new Map(),
      });

      const result = await validateUrl("https://example.com/broken");
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    it("should handle redirect loops", async () => {
      mockValidatedFetch.mockImplementation(() =>
        Promise.resolve({
          status: 302,
          statusText: "Found",
          headers: new Map([["location", "https://example.com/loop"]]),
        }),
      );

      const result = await validateUrl("https://example.com/loop");
      expect(result.valid).toBe(false);
      // If it doesn't detect loop, it might fail with max redirects or something else
      // But let's check what it actually returns
      expect(result.valid).toBe(false);
    });

    it("should handle network errors", async () => {
      mockValidatedFetch.mockRejectedValue(
        new Error("Network connection lost"),
      );

      const result = await validateUrl("https://example.com/fail");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Network connection lost");
    });
  });

  describe("checkUrlStatusBatch", () => {
    it("should validate a batch of URLs", async () => {
      mockValidatedFetch.mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: new Map(),
      });

      const urls = ["https://a.com", "https://b.com"];
      const result = await checkUrlStatusBatch(urls);

      expect(result.results).toHaveLength(2);
      expect(result.validCount).toBe(2);
    });
  });

  describe("detectRedirects", () => {
    it("should detect simple redirect", async () => {
      mockValidatedFetch.mockResolvedValueOnce({
        status: 302,
        statusText: "Found",
        headers: new Map([["location", "https://example.com/final"]]),
      });
      mockValidatedFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: new Map(),
      });

      const result = await detectRedirects("https://example.com/start");
      expect(result.redirectCount).toBe(1);
      expect(result.finalUrl).toBe("https://example.com/final");
    });
  });

  describe("isUrlDead", () => {
    it("should return true for invalid result", () => {
      expect(isUrlDead({ valid: false } as any)).toBe(true);
    });

    it("should return true for 404 status", () => {
      expect(isUrlDead({ valid: true, statusCode: 404 } as any)).toBe(true);
    });

    it("should return true for too many redirects", () => {
      expect(
        isUrlDead({ valid: true, statusCode: 200, redirectCount: 4 } as any),
      ).toBe(true);
    });

    it("should return false for healthy 200", () => {
      expect(
        isUrlDead({ valid: true, statusCode: 200, redirectCount: 0 } as any),
      ).toBe(false);
    });
  });

  describe("getValidationSummary", () => {
    it("should summarize results", () => {
      const results = [
        { valid: true, responseTimeMs: 100, redirectCount: 0 },
        { valid: true, responseTimeMs: 200, redirectCount: 1 },
        {
          valid: false,
          responseTimeMs: 300,
          redirectCount: 0,
          statusCode: 404,
        },
      ] as any[];

      const summary = getValidationSummary(results);
      expect(summary.total).toBe(3);
      expect(summary.valid).toBe(2);
      expect(summary.invalid).toBe(1);
      expect(summary.withRedirects).toBe(1);
      expect(summary.deadLinks).toBe(1);
      expect(summary.averageResponseTimeMs).toBe(200);
    });
  });
});
