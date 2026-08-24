import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateUrl,
  checkUrlStatusBatch,
  detectRedirects,
  isUrlDead,
  getValidationSummary,
} from "../../worker/lib/validation/url-validator";
import { validatedFetch } from "../../worker/lib/security";

// Mock logger to avoid noise
vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock validatedFetch at the cross-module seam to bypass SSRF DNS-over-HTTPS
// resolution (matches github.test.ts precedent, plans/GOAP_STATE.md
// 2026-07-10). Production paths (url-request.ts tryHeadRequest/tryGetRequest
// and detectRedirects) call validatedFetch, whose DoH lookup would consume
// global.fetch stubs as DNS responses and block every request.
vi.mock("../../worker/lib/security", () => ({
  validatedFetch: vi.fn(),
}));

describe("url-validator", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): clears pending mockResolvedValueOnce
    // queues so unconsumed responses cannot leak into the next test.
    vi.resetAllMocks();
    fetchMock = vi.mocked(validatedFetch);
  });

  describe("validateUrl", () => {
    it("should return valid for 200 OK", async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: new Map(),
      });

      const result = await validateUrl("https://example.com/deal");
      expect(result.valid).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.url).toBe("https://example.com/deal");
      // Successful HEAD short-circuits the GET fallback.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should follow redirects", async () => {
      // 301 Redirect
      fetchMock.mockResolvedValueOnce({
        status: 301,
        statusText: "Moved Permanently",
        headers: new Map([["location", "https://example.com/new"]]),
      });
      // 200 OK
      fetchMock.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: new Map(),
      });

      const result = await validateUrl("https://example.com/old");
      expect(result.valid).toBe(true);
      expect(result.redirectCount).toBe(1);
      expect(result.finalUrl).toBe("https://example.com/new");
      expect(result.redirectChain).toContain("https://example.com/new");
      // One request per hop along the redirect chain.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("should return invalid for 404", async () => {
      // HEAD 404 - invalid status short-circuits without GET fallback
      fetchMock.mockResolvedValueOnce({
        status: 404,
        statusText: "Not Found",
        headers: new Map(),
      });

      const result = await validateUrl("https://example.com/broken");
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(404);
      // Invalid status on HEAD returns immediately without GET fallback.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("should handle redirect loops", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          status: 302,
          statusText: "Found",
          headers: new Map([["location", "https://example.com/loop"]]),
        }),
      );

      const result = await validateUrl("https://example.com/loop");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Redirect loop detected");
    });

    it("should handle network errors", async () => {
      fetchMock.mockRejectedValue(new Error("Network connection lost"));

      const result = await validateUrl("https://example.com/fail");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Network connection lost");
      // HEAD failure falls back to GET before the error surfaces.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("checkUrlStatusBatch", () => {
    it("should validate a batch of URLs", async () => {
      fetchMock.mockResolvedValue({
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
      fetchMock.mockResolvedValueOnce({
        status: 302,
        statusText: "Found",
        headers: new Map([["location", "https://example.com/final"]]),
      });
      fetchMock.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: new Map(),
      });

      const result = await detectRedirects("https://example.com/start");
      expect(result.redirectCount).toBe(1);
      expect(result.finalUrl).toBe("https://example.com/final");
      // One request per hop: 302 probe then terminal 200.
      expect(fetchMock).toHaveBeenCalledTimes(2);
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
