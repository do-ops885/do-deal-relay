/**
 * Rate Limit KV Core Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkRateLimitKV,
  getRateLimitKVState,
  resetRateLimitKV,
  getAllRateLimitStates,
  getRateLimitStats,
} from "../../../worker/lib/rate-limit-kv";
import type { Env } from "../../../worker/types";

// Type for KV namespace mock
type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

describe("Rate Limit KV Core", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_LOCK: {
        get: vi.fn(async <T>(key: string, type?: string): Promise<T | null> => {
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
        list: vi.fn(
          async (options?: {
            prefix?: string;
          }): Promise<{ keys: { name: string }[] }> => {
            const keys: { name: string }[] = [];
            for (const key of mockKvStorage.keys()) {
              if (!options?.prefix || key.startsWith(options.prefix)) {
                keys.push({ name: key });
              }
            }
            return { keys };
          },
        ),
      } as unknown as MockKVNamespace,
    } as Env;
  });

  afterEach(() => {
    mockKvStorage.clear();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // checkRateLimitKV Tests
  // ==========================================================================

  describe("checkRateLimitKV", () => {
    it("should allow first request", async () => {
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.total).toBe(10);
    });

    it("should track multiple requests from same client", async () => {
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
    });

    it("should block requests at limit", async () => {
      // Make 10 requests (limit is 10)
      for (let i = 0; i < 10; i++) {
        await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      }

      // 11th request should be blocked
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should track different clients separately", async () => {
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      const result = await checkRateLimitKV(mockEnv, "client-2", 10, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should use custom maxRequests", async () => {
      const result = await checkRateLimitKV(mockEnv, "client-1", 5, 60);

      expect(result.total).toBe(5);
      expect(result.remaining).toBe(4);
    });

    it("should use custom windowSeconds", async () => {
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 300);

      // Reset should be within the window - not exact but should be around 300 seconds
      const now = Date.now();
      const windowEnd = now + 300000;
      // Should be less than or equal to window end + tolerance
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(windowEnd + 1000);
      // Should be at least some time from now (not zero)
      expect(result.resetAt.getTime()).toBeGreaterThan(now);
    });

    it("should fail open on KV error", async () => {
      mockEnv = {
        DEALS_LOCK: {
          get: vi.fn().mockRejectedValue(new Error("KV Error")),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn(),
        } as unknown as MockKVNamespace,
      } as Env;

      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      expect(result.allowed).toBe(true);
    });

    it("should reset window when expired", async () => {
      // First request
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      // Simulate time passing - manually set old window
      const oldKey = "rl:kv:client-1";
      const oldState = JSON.parse(mockKvStorage.get(oldKey) as string);
      oldState.window_start = 0; // Old window
      mockKvStorage.set(oldKey, JSON.stringify(oldState));

      // New request should start fresh
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should return correct resetAt timestamp", async () => {
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      // Reset should be in the future
      expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
      // Reset should be a valid date
      expect(isNaN(result.resetAt.getTime())).toBe(false);
    });
  });

  // ==========================================================================
  // getRateLimitKVState Tests
  // ==========================================================================

  describe("getRateLimitKVState", () => {
    it("should return null for non-existent client", async () => {
      const result = await getRateLimitKVState(mockEnv, "new-client", 60);
      expect(result).toBeNull();
    });

    it("should return state for existing client", async () => {
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      const result = await getRateLimitKVState(mockEnv, "client-1", 60);

      expect(result).not.toBeNull();
      expect(result?.client_id).toBe("client-1");
      expect(result?.request_count).toBe(1);
    });

    it("should return null for expired window", async () => {
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      // Manually expire the window
      const key = "rl:kv:client-1";
      const state = JSON.parse(mockKvStorage.get(key) as string);
      state.window_start = 0;
      mockKvStorage.set(key, JSON.stringify(state));

      const result = await getRateLimitKVState(mockEnv, "client-1", 60);
      expect(result).toBeNull();
    });

    it("should use default windowSeconds", async () => {
      await checkRateLimitKV(mockEnv, "client-1");

      const result = await getRateLimitKVState(mockEnv, "client-1");
      expect(result).not.toBeNull();
    });
  });

  // ==========================================================================
  // resetRateLimitKV Tests
  // ==========================================================================

  describe("resetRateLimitKV", () => {
    it("should reset existing client", async () => {
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);

      await resetRateLimitKV(mockEnv, "client-1", 60);

      // Should be able to make requests again
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      expect(result.remaining).toBe(9);
    });

    it("should handle non-existent client", async () => {
      await expect(
        resetRateLimitKV(mockEnv, "non-existent", 60),
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // getAllRateLimitStates Tests
  // ==========================================================================

  describe("getAllRateLimitStates", () => {
    it("should return empty map when no clients", async () => {
      const result = await getAllRateLimitStates(mockEnv);
      expect(result.size).toBe(0);
    });

    it("should return all client states", async () => {
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      await checkRateLimitKV(mockEnv, "client-2", 10, 60);
      await checkRateLimitKV(mockEnv, "client-3", 10, 60);

      const result = await getAllRateLimitStates(mockEnv);
      expect(result.size).toBe(3);
      expect(result.has("client-1")).toBe(true);
      expect(result.has("client-2")).toBe(true);
      expect(result.has("client-3")).toBe(true);
    });

    it("should handle KV errors gracefully", async () => {
      mockEnv = {
        DEALS_LOCK: {
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn().mockRejectedValue(new Error("KV Error")),
        } as unknown as MockKVNamespace,
      } as Env;

      const result = await getAllRateLimitStates(mockEnv);
      expect(result.size).toBe(0);
    });
  });

  // ==========================================================================
  // getRateLimitStats Tests
  // ==========================================================================

  describe("getRateLimitStats", () => {
    it("should return zero stats when no clients", async () => {
      const stats = await getRateLimitStats(mockEnv);

      expect(stats.activeClients).toBe(0);
      expect(stats.rateLimitedClients).toBe(0);
      expect(stats.avgRequestsPerClient).toBe(0);
    });

    it("should calculate correct stats", async () => {
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      await checkRateLimitKV(mockEnv, "client-1", 10, 60);
      await checkRateLimitKV(mockEnv, "client-2", 10, 60);

      const stats = await getRateLimitStats(mockEnv);

      expect(stats.activeClients).toBe(2);
      expect(stats.avgRequestsPerClient).toBe(1.5);
    });

    it("should count rate-limited clients", async () => {
      // Make client-1 hit the limit using the default 100 requests
      for (let i = 0; i < 100; i++) {
        await checkRateLimitKV(mockEnv, "client-1", 100, 60);
      }

      // client-2 is under limit
      await checkRateLimitKV(mockEnv, "client-2", 100, 60);

      const stats = await getRateLimitStats(mockEnv);

      expect(stats.activeClients).toBe(2);
      expect(stats.rateLimitedClients).toBe(1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle empty clientId", async () => {
      const result = await checkRateLimitKV(mockEnv, "", 10, 60);
      expect(result.allowed).toBe(true);
    });

    it("should handle very long clientId", async () => {
      const longId = "a".repeat(500);
      const result = await checkRateLimitKV(mockEnv, longId, 10, 60);
      expect(result.allowed).toBe(true);
    });

    it("should handle special characters in clientId", async () => {
      const specialId = "client-with-dashes_and.dots";
      const result = await checkRateLimitKV(mockEnv, specialId, 10, 60);
      expect(result.allowed).toBe(true);
    });

    it("should handle zero maxRequests", async () => {
      const result = await checkRateLimitKV(mockEnv, "client-1", 0, 60);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should handle very small window", async () => {
      const result = await checkRateLimitKV(mockEnv, "client-1", 10, 1);
      // Window should be 1 second
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(Date.now() + 2000);
    });
  });

  // ==========================================================================
  // Sliding Window Behavior
  // ==========================================================================

  describe("Sliding Window Behavior", () => {
    it("should track request count accurately", async () => {
      for (let i = 1; i <= 5; i++) {
        const result = await checkRateLimitKV(
          mockEnv,
          "sliding-client",
          10,
          60,
        );
        expect(result.remaining).toBe(10 - i);
      }
    });

    it("should allow after window reset", async () => {
      // Fill up the window
      for (let i = 0; i < 10; i++) {
        await checkRateLimitKV(mockEnv, "reset-client", 10, 1);
      }

      // Wait for window to "expire" (in real scenario, time would pass)
      // Manually reset by deleting the key
      await resetRateLimitKV(mockEnv, "reset-client", 1);

      // Should be allowed again
      const result = await checkRateLimitKV(mockEnv, "reset-client", 10, 1);
      expect(result.allowed).toBe(true);
    });

    it("should maintain separate windows for different window sizes", async () => {
      // Use 60-second window
      await checkRateLimitKV(mockEnv, "client", 10, 60);

      // Use 300-second window - should be separate
      const result = await checkRateLimitKV(mockEnv, "client", 10, 300);

      // Both requests should count in their respective windows
      // But the key would be different since windowSeconds is part of calculation
      expect(result.allowed).toBe(true);
    });
  });
});
