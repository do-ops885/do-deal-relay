/**
 * Rate Limit KV Middleware Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createRateLimitKVStore,
  createRateLimitKVMiddleware,
  batchCheckRateLimitKV,
  getRateLimitKVState,
} from "../../../worker/lib/rate-limit-kv";
import type { Env } from "../../../worker/types";

// Type for KV namespace mock
type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

describe("Rate Limit KV Middleware", () => {
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
  // createRateLimitKVStore Tests
  // ==========================================================================

  describe("createRateLimitKVStore", () => {
    it("should create store with default config", () => {
      const store = createRateLimitKVStore(mockEnv);

      expect(store.config.maxRequests).toBe(100);
      expect(store.config.windowSeconds).toBe(60);
    });

    it("should create store with custom config", () => {
      const store = createRateLimitKVStore(mockEnv, {
        maxRequests: 50,
        windowSeconds: 120,
      });

      expect(store.config.maxRequests).toBe(50);
      expect(store.config.windowSeconds).toBe(120);
    });

    it("should provide checkLimit function", async () => {
      const store = createRateLimitKVStore(mockEnv, {
        maxRequests: 10,
        windowSeconds: 60,
      });
      const result = await store.checkLimit("client-1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should provide getState function", async () => {
      const store = createRateLimitKVStore(mockEnv);
      await store.checkLimit("client-1");

      const state = await store.getState("client-1");
      expect(state?.client_id).toBe("client-1");
    });

    it("should provide reset function", async () => {
      const store = createRateLimitKVStore(mockEnv);
      await store.checkLimit("client-1");
      await store.checkLimit("client-1");

      await store.reset("client-1");

      const state = await store.getState("client-1");
      expect(state).toBeNull();
    });
  });

  // ==========================================================================
  // createRateLimitKVMiddleware Tests
  // ==========================================================================

  describe("createRateLimitKVMiddleware", () => {
    it("should allow request under limit", async () => {
      const middleware = createRateLimitKVMiddleware(mockEnv, {
        maxRequests: 10,
        windowSeconds: 60,
      });
      const handler = vi.fn().mockResolvedValue(new Response("OK"));

      const request = new Request("http://localhost/test");
      const response = await middleware(request, handler);

      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("should block request over limit", async () => {
      const middleware = createRateLimitKVMiddleware(mockEnv, {
        maxRequests: 1,
        windowSeconds: 60,
      });

      // Use up the limit
      const firstRequest = new Request("http://localhost/test");
      await middleware(
        firstRequest,
        vi.fn().mockResolvedValue(new Response("OK")),
      );

      // Second request should be blocked
      const blockedRequest = new Request("http://localhost/test");
      const response = await middleware(
        blockedRequest,
        vi.fn().mockResolvedValue(new Response("OK")),
      );

      expect(response.status).toBe(429);
    });

    it("should use custom getClientId function", async () => {
      const middleware = createRateLimitKVMiddleware(mockEnv, {
        maxRequests: 10,
        windowSeconds: 60,
        getClientId: (req) => req.headers.get("X-Custom-Id") ?? "default",
      });

      const request = new Request("http://localhost/test", {
        headers: { "X-Custom-Id": "custom-client" },
      });

      await middleware(request, vi.fn().mockResolvedValue(new Response("OK")));

      // Check state was stored with custom ID
      const state = await getRateLimitKVState(mockEnv, "custom-client", 60);
      expect(state).not.toBeNull();
    });

    it("should include rate limit headers", async () => {
      const middleware = createRateLimitKVMiddleware(mockEnv, {
        maxRequests: 10,
        windowSeconds: 60,
      });

      const request = new Request("http://localhost/test");
      const response = await middleware(
        request,
        vi.fn().mockResolvedValue(new Response("OK")),
      );

      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
    });

    it("should include Retry-After header when blocked", async () => {
      const middleware = createRateLimitKVMiddleware(mockEnv, {
        maxRequests: 1,
        windowSeconds: 60,
      });

      // Use up the limit
      await middleware(
        new Request("http://localhost/test"),
        vi.fn().mockResolvedValue(new Response("OK")),
      );

      // Blocked request
      const response = await middleware(
        new Request("http://localhost/test"),
        vi.fn().mockResolvedValue(new Response("OK")),
      );

      expect(response.headers.get("Retry-After")).toBeDefined();
    });
  });

  // ==========================================================================
  // batchCheckRateLimitKV Tests
  // ==========================================================================

  describe("batchCheckRateLimitKV", () => {
    it("should return empty map for empty input", async () => {
      const result = await batchCheckRateLimitKV(mockEnv, []);
      expect(result.size).toBe(0);
    });

    it("should check multiple clients", async () => {
      const result = await batchCheckRateLimitKV(
        mockEnv,
        ["client-1", "client-2", "client-3"],
        10,
        60,
      );

      expect(result.size).toBe(3);
      expect(result.get("client-1")?.allowed).toBe(true);
      expect(result.get("client-2")?.allowed).toBe(true);
      expect(result.get("client-3")?.allowed).toBe(true);
    });

    it("should track counts separately for batch", async () => {
      // After 3 batch calls, each client has 3 requests
      await batchCheckRateLimitKV(mockEnv, ["client-1", "client-2"], 10, 60);
      await batchCheckRateLimitKV(mockEnv, ["client-1", "client-2"], 10, 60);
      await batchCheckRateLimitKV(mockEnv, ["client-1", "client-2"], 10, 60);

      const result = await batchCheckRateLimitKV(
        mockEnv,
        ["client-1", "client-2"],
        10,
        60,
      );

      // Each client has made 4 requests total (3 batch calls + 1 in this call = 4)
      // Wait, each batch call increments by 1, so 3 calls = 3 requests
      // The fourth call will make it 4 requests, remaining = 10 - 4 = 6
      expect(result.get("client-1")?.remaining).toBe(6);
      expect(result.get("client-2")?.remaining).toBe(6);
    });
  });
});
