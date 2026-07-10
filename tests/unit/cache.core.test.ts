import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  KVCache,
  CacheEntry,
  createSourceCache,
  createGitHubCache,
  createRobotsTxtCache,
  createSnapshotCache,
  createStagingSnapshotCache,
  getAllCacheMetrics,
  resetAllCacheMetrics,
  clearAllCaches,
  resetAllCaches,
} from "../../worker/lib/cache";
import type { Env } from "../../worker/types";

describe("KVCache", () => {
  let mockKv: any;
  let cache: KVCache;

  beforeEach(() => {
    // Reset all metrics before each test to prevent test leakage
    resetAllCacheMetrics();

    // Setup mock KV with typed storage
    const storage = new Map<string, string>();

    mockKv = {
      get: vi.fn(async <T>(key: string, type?: string): Promise<T | null> => {
        const value = storage.get(key);
        if (!value) return null;
        if (type === "json") {
          return JSON.parse(value) as T;
        }
        return value as unknown as T;
      }),
      put: vi.fn(async (key: string, value: string, _options?: unknown) => {
        storage.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
      list: vi.fn(async ({ prefix }: { prefix: string }) => {
        const keys: { name: string }[] = [];
        for (const [key] of storage.entries()) {
          if (key.startsWith(prefix)) {
            keys.push({ name: key });
          }
        }
        return { keys };
      }),
    };

    // Create cache instance with 5 minute default TTL
    cache = new KVCache(mockKv, 300, "test");
  });

  // ============================================================================
  // Basic Store and Retrieve Tests
  // ============================================================================

  describe("set() and get()", () => {
    it("should store and retrieve a value", async () => {
      const key = "my-key";
      const value = { name: "test", data: [1, 2, 3] };

      await cache.set(key, value);
      const result = await cache.get<typeof value>(key);

      expect(result).toEqual(value);
      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:test:my-key",
        expect.stringContaining("test"),
        { expirationTtl: 300 },
      );
    });

    it("should return null for cache miss", async () => {
      const result = await cache.get("nonexistent-key");

      expect(result).toBeNull();
    });

    it("should cache hit returns correct value", async () => {
      const key = "hit-key";
      const value = "cached-value";

      await cache.set(key, value);
      const result = await cache.get<string>(key);

      expect(result).toBe(value);
    });

    it("should handle complex JSON objects", async () => {
      const key = "complex-key";
      const value = {
        nested: { deep: { value: 42 } },
        array: [1, 2, { nested: "object" }],
        nullValue: null,
        boolean: true,
        number: 3.14159,
      };

      await cache.set(key, value);
      const result = await cache.get<typeof value>(key);

      expect(result).toEqual(value);
    });
  });

  // ============================================================================
  // Delete Tests
  // ============================================================================

  describe("delete()", () => {
    it("should remove cached value", async () => {
      const key = "delete-key";
      const value = "delete-me";

      await cache.set(key, value);
      let result = await cache.get<string>(key);
      expect(result).toBe(value);

      await cache.delete(key);

      result = await cache.get<string>(key);
      expect(result).toBeNull();
      expect(mockKv.delete).toHaveBeenCalledWith("cache:test:delete-key");
    });

    it("should not throw when deleting non-existent key", async () => {
      await expect(cache.delete("non-existent-key")).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // getOrSet Tests
  // ============================================================================

  describe("getOrSet()", () => {
    it("should compute and cache on miss", async () => {
      const key = "computed-key";
      const value = { computed: true, timestamp: Date.now() };
      const factory = vi.fn().mockResolvedValue(value);

      const result = await cache.getOrSet(key, factory);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(result).toEqual(value);

      // Value should be cached now
      const cached = await cache.get<typeof value>(key);
      expect(cached).toEqual(value);
    });

    it("should return cached on hit without calling factory", async () => {
      const key = "cached-hit-key";
      const value = "cached-value";
      const factory = vi.fn().mockResolvedValue("new-value");

      await cache.set(key, value);
      const result = await cache.getOrSet<string>(key, factory);

      expect(factory).not.toHaveBeenCalled();
      expect(result).toBe(value);
    });

    it("should use custom TTL for factory-computed values", async () => {
      const key = "custom-ttl-factory";
      const value = "factory-value";
      const factory = vi.fn().mockResolvedValue(value);
      const customTtl = 600;

      await cache.getOrSet(key, factory, customTtl);

      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:test:custom-ttl-factory",
        expect.any(String),
        { expirationTtl: customTtl },
      );
    });

    it("should use default TTL when not specified in getOrSet", async () => {
      const key = "default-ttl-factory";
      const value = "factory-value";
      const factory = vi.fn().mockResolvedValue(value);

      await cache.getOrSet(key, factory);

      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:test:default-ttl-factory",
        expect.any(String),
        { expirationTtl: 300 }, // Default TTL
      );
    });

    it("should handle factory errors", async () => {
      const key = "error-factory";
      const error = new Error("Factory failed");
      const factory = vi.fn().mockRejectedValue(error);

      await expect(cache.getOrSet(key, factory)).rejects.toThrow(
        "Factory failed",
      );
    });
  });

  // ============================================================================
  // Clear Tests
  // ============================================================================

  describe("clear()", () => {
    it("should remove all values in namespace", async () => {
      const cache1 = new KVCache(mockKv, 300, "clear-ns1");
      const cache2 = new KVCache(mockKv, 300, "clear-ns2");

      await cache1.set("key1", "value1");
      await cache1.set("key2", "value2");
      await cache2.set("key3", "value3");

      // Clear only cache1 namespace
      await cache1.clear();

      // cache1 keys should be gone
      expect(await cache1.get("key1")).toBeNull();
      expect(await cache1.get("key2")).toBeNull();

      // cache2 key should still exist
      expect(await cache2.get("key3")).toBe("value3");
    });

    it("should handle empty namespace", async () => {
      const emptyCache = new KVCache(mockKv, 300, "empty-ns");
      await expect(emptyCache.clear()).resolves.not.toThrow();
    });

    it("should call list with namespaced prefix", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      await cache.clear();

      // clear() uses `cache:${namespace}:` prefix which matches the key() method
      expect(mockKv.list).toHaveBeenCalledWith({ prefix: "cache:test:" });
    });
  });

  // ============================================================================
  // has() Tests
  // ============================================================================

  describe("has()", () => {
    it("should return true for existing valid key", async () => {
      await cache.set("exists", "value");
      const result = await cache.has("exists");
      expect(result).toBe(true);
    });

    it("should return false for non-existent key", async () => {
      const result = await cache.has("does-not-exist");
      expect(result).toBe(false);
    });

    it("should return false for expired key", async () => {
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      await cache.set("expires", "value", 1);

      // Should exist
      expect(await cache.has("expires")).toBe(true);

      // Advance past TTL
      currentTime += 2000;

      // Should not exist (and should be deleted)
      expect(await cache.has("expires")).toBe(false);

      vi.restoreAllMocks();
    });

    it("should not increment metrics", async () => {
      await cache.set("key", "value");

      await cache.has("key");
      await cache.has("nonexistent");

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });

  // ============================================================================
  // JSON Serialization Tests
  // ============================================================================

  describe("JSON serialization", () => {
    it("should serialize objects with metadata", async () => {
      const key = "json-key";
      const value = { data: "test" };

      await cache.set(key, value);

      const putCall = vi.mocked(mockKv.put).mock.calls[0];
      const storedJson = putCall[1] as string;
      const parsed = JSON.parse(storedJson) as CacheEntry<typeof value>;

      expect(parsed.data).toEqual(value);
      expect(parsed.timestamp).toBeTypeOf("number");
      expect(parsed.ttl_seconds).toBe(300);
    });

    it("should handle arrays", async () => {
      const key = "array-key";
      const value = [1, 2, 3, { nested: "object" }];

      await cache.set(key, value);
      const result = await cache.get<typeof value>(key);

      expect(result).toEqual(value);
    });

    it("should handle null values", async () => {
      const key = "null-key";
      const value = null;

      await cache.set(key, value);
      const result = await cache.get<typeof value>(key);

      expect(result).toBeNull();
    });

    it("should handle undefined as null in JSON", async () => {
      const key = "undefined-key";
      const value = { data: undefined };

      await cache.set(key, value);
      const result = await cache.get<typeof value>(key);

      // JSON.stringify drops undefined values
      expect(result).toEqual({});
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe("factory functions", () => {
    const makeEnv = (kv: any, extra?: Record<string, unknown>): Env =>
      ({
        DEALS_SOURCES: kv,
        DEALS_PROD: kv,
        DEALS_STAGING: kv,
        DEALS_LOG: kv,
        DEALS_LOCK: kv,
        AI_GATEWAY_URL: "https://gateway.test",
        WEBHOOK_SECRET: "test-secret",
        API_ENCRYPTION_KEY: "test-key",
        EMAIL_WEBHOOK_SECRET: "test-email-secret",
        DEALS_DB: {} as any,
        TRUST_THRESHOLD: "0.3",
        ...extra,
      }) as unknown as Env;

    it("should create source cache with correct config", () => {
      const kv = { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn() };
      const sourceCache = createSourceCache(makeEnv(kv));
      expect(sourceCache).toBeInstanceOf(KVCache);

      sourceCache.set("key", "value");
      expect(kv.put).toHaveBeenCalledWith(
        "cache:sources:key",
        expect.any(String),
        { expirationTtl: 300 },
      );
    });

    it("should create GitHub cache with correct config", () => {
      const kv = { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn() };
      const githubCache = createGitHubCache(makeEnv(kv));
      expect(githubCache).toBeInstanceOf(KVCache);

      githubCache.set("key", "value");
      expect(kv.put).toHaveBeenCalledWith(
        "cache:github:key",
        expect.any(String),
        { expirationTtl: 60 },
      );
    });

    it("should create robots.txt cache with correct config", () => {
      const kv = { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn() };
      const robotsCache = createRobotsTxtCache(
        makeEnv(kv, { DEALS_LOCK: undefined }),
      );
      expect(robotsCache).toBeInstanceOf(KVCache);

      robotsCache.set("key", "value");
      expect(kv.put).toHaveBeenCalledWith(
        "cache:robots_txt:key",
        expect.any(String),
        { expirationTtl: 3600 },
      );
    });

    it("should create snapshot cache with correct config", () => {
      const kv = { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn() };
      const snapshotCache = createSnapshotCache(makeEnv(kv));
      expect(snapshotCache).toBeInstanceOf(KVCache);

      snapshotCache.set("key", "value");
      expect(kv.put).toHaveBeenCalledWith(
        "cache:snapshot:key",
        expect.any(String),
        { expirationTtl: 30 },
      );
    });

    it("should create staging snapshot cache with correct config", () => {
      const kv = { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn() };
      const stagingCache = createStagingSnapshotCache(makeEnv(kv));
      expect(stagingCache).toBeInstanceOf(KVCache);

      stagingCache.set("key", "value");
      expect(kv.put).toHaveBeenCalledWith(
        "cache:staging_snapshot:key",
        expect.any(String),
        { expirationTtl: 30 },
      );
    });
  });
});
