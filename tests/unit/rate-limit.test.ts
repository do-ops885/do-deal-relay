import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
  resetRateLimit,
  getRateLimitConfig,
} from "../../worker/lib/rate-limit";
import type { Env } from "../../worker/types";

describe("Rate Limiting", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_LOCK: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(key);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(
          async (
            key: string,
            value: string,
            _options?: { expirationTtl?: number },
          ) => {
            mockKvStorage.set(key, value);
          },
        ),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(key);
        }),
      } as unknown as KVNamespace,
    } as Env;
  });

  describe("checkRateLimit", () => {
    it("should allow requests under the limit", async () => {
      const result = await checkRateLimit(mockEnv, "client-1", "/api/submit");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 10 max - 1 used
      expect(result.limit).toBe(10);
    });

    it("should track multiple requests from same client", async () => {
      await checkRateLimit(mockEnv, "client-1", "/api/submit");
      await checkRateLimit(mockEnv, "client-1", "/api/submit");
      const result = await checkRateLimit(mockEnv, "client-1", "/api/submit");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7); // 10 max - 3 used
    });

    it("should block requests over the limit", async () => {
      // Make 10 requests (the limit)
      for (let i = 0; i < 10; i++) {
        await checkRateLimit(mockEnv, "client-1", "/api/submit");
      }

      // 11th request should be blocked
      const result = await checkRateLimit(mockEnv, "client-1", "/api/submit");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should track different clients separately", async () => {
      await checkRateLimit(mockEnv, "client-1", "/api/submit");
      await checkRateLimit(mockEnv, "client-1", "/api/submit");

      const result = await checkRateLimit(mockEnv, "client-2", "/api/submit");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // New client has full quota
    });

    it("should use different limits for different endpoints", async () => {
      const submitResult = await checkRateLimit(
        mockEnv,
        "client-1",
        "/api/submit",
      );
      const discoverResult = await checkRateLimit(
        mockEnv,
        "client-1",
        "/api/discover",
      );

      expect(submitResult.limit).toBe(10);
      expect(discoverResult.limit).toBe(5);
    });

    it("should fail open if KV throws error", async () => {
      // Make KV throw an error
      mockEnv.DEALS_LOCK = {
        get: vi.fn().mockRejectedValue(new Error("KV error")),
        put: vi.fn(),
        delete: vi.fn(),
      } as unknown as KVNamespace;

      const result = await checkRateLimit(mockEnv, "client-1", "/api/submit");

      expect(result.allowed).toBe(true);
    });
  });

  describe("getClientIdentifier", () => {
    it("should extract API key from header", () => {
      const request = new Request("http://localhost/api/test", {
        headers: { "X-API-Key": "test-api-key-12345" },
      });

      const identifier = getClientIdentifier(request);

      expect(identifier).toBe("api:test-api"); // First 8 chars
    });

    it("should fall back to IP address", () => {
      const request = new Request("http://localhost/api/test", {
        headers: { "CF-Connecting-IP": "192.168.1.1" },
      });

      const identifier = getClientIdentifier(request);

      expect(identifier).toBe("ip:192.168.1.1");
    });

    it("should use unknown if no identifier available", () => {
      const request = new Request("http://localhost/api/test");

      const identifier = getClientIdentifier(request);

      expect(identifier).toBe("ip:unknown");
    });
  });

  describe("createRateLimitHeaders", () => {
    it("should create standard rate limit headers for allowed request", () => {
      const result = {
        allowed: true,
        remaining: 5,
        resetTime: 1234567890,
        limit: 10,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers.get("X-RateLimit-Limit")).toBe("10");
      expect(headers.get("X-RateLimit-Remaining")).toBe("5");
      expect(headers.get("X-RateLimit-Reset")).toBe("1234567890");
    });

    it("should include Retry-After header for blocked requests", () => {
      const now = Math.floor(Date.now() / 1000);
      const result = {
        allowed: false,
        remaining: 0,
        resetTime: now + 60,
        limit: 10,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers.get("Retry-After")).toBe("60");
    });
  });

  describe("getRateLimitConfig", () => {
    it("should return config for known endpoints", () => {
      const config = getRateLimitConfig("/api/submit");

      expect(config.maxRequests).toBe(10);
      expect(config.windowSeconds).toBe(60);
    });

    it("should return default config for unknown endpoints", () => {
      const config = getRateLimitConfig("/unknown");

      expect(config.maxRequests).toBe(100);
      expect(config.windowSeconds).toBe(60);
    });
  });

  describe("resetRateLimit", () => {
    it("should reset rate limit counter", async () => {
      // Use up some quota
      await checkRateLimit(mockEnv, "client-1", "/api/submit");
      await checkRateLimit(mockEnv, "client-1", "/api/submit");

      // Reset
      await resetRateLimit(mockEnv, "client-1", "/api/submit");

      // Should have full quota again
      const result = await checkRateLimit(mockEnv, "client-1", "/api/submit");
      expect(result.remaining).toBe(9);
    });
  });
});
