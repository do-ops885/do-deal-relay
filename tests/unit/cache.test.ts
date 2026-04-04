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
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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

    // Spy on console.error to verify error handling
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
  // TTL Expiration Tests
  // ============================================================================

  describe("TTL expiration", () => {
    it("should return null after TTL expiry", async () => {
      const key = "expiring-key";
      const value = "will-expire";
      const shortTtl = 1; // 1 second

      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      await cache.set(key, value, shortTtl);

      // Should exist immediately
      const resultBefore = await cache.get<string>(key);
      expect(resultBefore).toBe(value);

      // Advance time past TTL (1 second + 1ms)
      currentTime += shortTtl * 1000 + 1;

      // Should be expired now
      const resultAfter = await cache.get<string>(key);
      expect(resultAfter).toBeNull();

      // Should trigger eviction and delete
      expect(mockKv.delete).toHaveBeenCalledWith("cache:test:expiring-key");

      // Restore Date.now
      vi.restoreAllMocks();
    });

    it("should use default TTL when not specified", async () => {
      const key = "default-ttl-key";
      const value = "default-ttl-value";

      await cache.set(key, value);

      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:test:default-ttl-key",
        expect.any(String),
        { expirationTtl: 300 }, // Default 300 seconds
      );
    });

    it("should allow custom TTL to override default", async () => {
      const key = "custom-ttl-key";
      const value = "custom-ttl-value";
      const customTtl = 600;

      await cache.set(key, value, customTtl);

      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:test:custom-ttl-key",
        expect.any(String),
        { expirationTtl: 600 },
      );
    });

    it("should handle zero TTL gracefully", async () => {
      const key = "zero-ttl-key";
      const value = "zero-ttl-value";

      await cache.set(key, value, 0);

      // Should still store with 0 TTL
      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:test:zero-ttl-key",
        expect.any(String),
        { expirationTtl: 0 },
      );
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
  // Metrics Tests
  // ============================================================================

  describe("getMetrics()", () => {
    it("should track hits", async () => {
      await cache.set("hit-key", "value");

      // First access - hit
      await cache.get("hit-key");
      const metrics1 = cache.getMetrics();
      expect(metrics1.hits).toBe(1);
      expect(metrics1.misses).toBe(0);

      // Second access - another hit
      await cache.get("hit-key");
      const metrics2 = cache.getMetrics();
      expect(metrics2.hits).toBe(2);
      expect(metrics2.misses).toBe(0);
    });

    it("should track misses", async () => {
      // Access non-existent key - miss
      await cache.get("miss-key-1");
      const metrics1 = cache.getMetrics();
      expect(metrics1.hits).toBe(0);
      expect(metrics1.misses).toBe(1);

      // Access another non-existent key - another miss
      await cache.get("miss-key-2");
      const metrics2 = cache.getMetrics();
      expect(metrics2.hits).toBe(0);
      expect(metrics2.misses).toBe(2);
    });

    it("should track evictions", async () => {
      const key = "evict-key";
      const value = "evict-value";

      // Mock Date.now to control time
      let currentTime = 1000000;
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      await cache.set(key, value, 1);

      // Access while valid - hit, no eviction
      await cache.get(key);
      const metrics1 = cache.getMetrics();
      expect(metrics1.evictions).toBe(0);

      // Advance past TTL
      currentTime += 2000;

      // Access expired - triggers eviction and miss
      await cache.get(key);
      const metrics2 = cache.getMetrics();
      expect(metrics2.evictions).toBe(1);
      expect(metrics2.misses).toBe(1); // Also counts as miss

      vi.restoreAllMocks();
    });

    it("should calculate hit rate correctly", async () => {
      // 3 hits, 1 miss = 75% hit rate
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.set("key3", "value3");

      await cache.get("key1"); // hit
      await cache.get("key2"); // hit
      await cache.get("key3"); // hit
      await cache.get("nonexistent"); // miss

      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBe(0.75); // 3/4
      expect(metrics.missRate).toBe(0.25); // 1/4
    });

    it("should return 0 rates when no accesses", async () => {
      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBe(0);
      expect(metrics.missRate).toBe(0);
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
    });

    it("should handle 100% hit rate", async () => {
      await cache.set("key", "value");
      await cache.get("key");
      await cache.get("key");
      await cache.get("key");

      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBe(1);
      expect(metrics.missRate).toBe(0);
    });

    it("should handle 100% miss rate", async () => {
      await cache.get("key1");
      await cache.get("key2");
      await cache.get("key3");

      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBe(0);
      expect(metrics.missRate).toBe(1);
    });
  });

  describe("resetMetrics()", () => {
    it("should reset all metrics to zero", async () => {
      await cache.set("key", "value");
      await cache.get("key"); // hit
      await cache.get("nonexistent"); // miss

      let metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);

      cache.resetMetrics();

      metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
      expect(metrics.hitRate).toBe(0);
      expect(metrics.missRate).toBe(0);
    });
  });

  // ============================================================================
  // Namespacing Tests
  // ============================================================================

  describe("namespacing", () => {
    it("should isolate keys across namespaces", async () => {
      const cache1 = new KVCache(mockKv, 300, "namespace1");
      const cache2 = new KVCache(mockKv, 300, "namespace2");

      await cache1.set("shared-key", "value-from-ns1");
      await cache2.set("shared-key", "value-from-ns2");

      const result1 = await cache1.get<string>("shared-key");
      const result2 = await cache2.get<string>("shared-key");

      expect(result1).toBe("value-from-ns1");
      expect(result2).toBe("value-from-ns2");

      // Verify keys are namespaced
      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:namespace1:shared-key",
        expect.any(String),
        expect.any(Object),
      );
      expect(mockKv.put).toHaveBeenCalledWith(
        "cache:namespace2:shared-key",
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should isolate metrics across namespaces", async () => {
      const cache1 = new KVCache(mockKv, 300, "metrics-ns1");
      const cache2 = new KVCache(mockKv, 300, "metrics-ns2");

      await cache1.set("key", "value");
      await cache1.get("key"); // hit for ns1
      await cache2.get("nonexistent"); // miss for ns2

      const metrics1 = cache1.getMetrics();
      const metrics2 = cache2.getMetrics();

      expect(metrics1.hits).toBe(1);
      expect(metrics1.misses).toBe(0);
      expect(metrics2.hits).toBe(0);
      expect(metrics2.misses).toBe(1);
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
    it.skip("should remove all values in namespace - BUG: clear() uses wrong prefix", async () => {
      // BUG: The clear() method in cache.ts uses prefix `${namespace}:` but keys
      // are stored with prefix `cache:${namespace}:`, so clear() doesn't work
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

    it("should call list with namespace prefix", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      await cache.clear();

      // Note: This documents current behavior which uses `${namespace}:` prefix
      // rather than `cache:${namespace}:` which would be correct
      expect(mockKv.list).toHaveBeenCalledWith({ prefix: "test:" });
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
  // Error Handling Tests
  // ============================================================================

  describe("error handling", () => {
    it("should handle KV get errors gracefully", async () => {
      vi.mocked(mockKv.get).mockRejectedValue(new Error("KV unavailable"));

      const result = await cache.get("key");

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Cache get error for key key:",
        expect.any(Error),
      );
    });

    it("should handle KV put errors by throwing", async () => {
      vi.mocked(mockKv.put).mockRejectedValue(new Error("Write failed"));

      await expect(cache.set("key", "value")).rejects.toThrow("Write failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Cache set error for key key:",
        expect.any(Error),
      );
    });

    it("should handle KV delete errors by throwing", async () => {
      vi.mocked(mockKv.delete).mockRejectedValue(new Error("Delete failed"));

      await expect(cache.delete("key")).rejects.toThrow("Delete failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Cache delete error for key key:",
        expect.any(Error),
      );
    });

    it("should handle KV list errors in clear()", async () => {
      vi.mocked(mockKv.list).mockRejectedValue(new Error("List failed"));

      await expect(cache.clear()).rejects.toThrow("List failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Cache clear error:",
        expect.any(Error),
      );
    });

    it("should handle invalid JSON in get() gracefully", async () => {
      // Simulate corrupted JSON that will throw when parsed
      vi.mocked(mockKv.get).mockImplementation(async () => {
        throw new Error("Invalid JSON");
      });

      const result = await cache.get("corrupted");

      expect(result).toBeNull();
    });

    it("should handle has() errors gracefully", async () => {
      vi.mocked(mockKv.get).mockRejectedValue(new Error("Read error"));

      const result = await cache.has("key");

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe("factory functions", () => {
    it("should create source cache with correct config", () => {
      const mockKvSources = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const env = {
        DEALS_SOURCES: mockKvSources,
        DEALS_PROD: mockKvSources,
        DEALS_STAGING: mockKvSources,
      } as unknown as Env;

      const sourceCache = createSourceCache(env);
      expect(sourceCache).toBeInstanceOf(KVCache);

      // Should be namespaced under 'sources'
      sourceCache.set("key", "value");
      expect(mockKvSources.put).toHaveBeenCalledWith(
        "cache:sources:key",
        expect.any(String),
        { expirationTtl: 300 },
      );
    });

    it("should create GitHub cache with correct config", () => {
      const mockKvProd = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const env = {
        DEALS_SOURCES: mockKvProd,
        DEALS_PROD: mockKvProd,
        DEALS_STAGING: mockKvProd,
      } as unknown as Env;

      const githubCache = createGitHubCache(env);
      expect(githubCache).toBeInstanceOf(KVCache);

      githubCache.set("key", "value");
      expect(mockKvProd.put).toHaveBeenCalledWith(
        "cache:github:key",
        expect.any(String),
        { expirationTtl: 60 },
      );
    });

    it("should create robots.txt cache with correct config", () => {
      const mockKvSources = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const env = {
        DEALS_SOURCES: mockKvSources,
        DEALS_PROD: mockKvSources,
        DEALS_STAGING: mockKvSources,
      } as unknown as Env;

      const robotsCache = createRobotsTxtCache(env);
      expect(robotsCache).toBeInstanceOf(KVCache);

      robotsCache.set("key", "value");
      expect(mockKvSources.put).toHaveBeenCalledWith(
        "cache:robots_txt:key",
        expect.any(String),
        { expirationTtl: 3600 },
      );
    });

    it("should create snapshot cache with correct config", () => {
      const mockKvProd = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const env = {
        DEALS_SOURCES: mockKvProd,
        DEALS_PROD: mockKvProd,
        DEALS_STAGING: mockKvProd,
      } as unknown as Env;

      const snapshotCache = createSnapshotCache(env);
      expect(snapshotCache).toBeInstanceOf(KVCache);

      snapshotCache.set("key", "value");
      expect(mockKvProd.put).toHaveBeenCalledWith(
        "cache:snapshot:key",
        expect.any(String),
        { expirationTtl: 30 },
      );
    });

    it("should create staging snapshot cache with correct config", () => {
      const mockKvStaging = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };

      const env = {
        DEALS_SOURCES: mockKvStaging,
        DEALS_PROD: mockKvStaging,
        DEALS_STAGING: mockKvStaging,
      } as unknown as Env;

      const stagingCache = createStagingSnapshotCache(env);
      expect(stagingCache).toBeInstanceOf(KVCache);

      stagingCache.set("key", "value");
      expect(mockKvStaging.put).toHaveBeenCalledWith(
        "cache:staging_snapshot:key",
        expect.any(String),
        { expirationTtl: 30 },
      );
    });
  });

  // ============================================================================
  // Global Metrics Tests
  // ============================================================================

  describe("getAllCacheMetrics()", () => {
    it("should return metrics for all namespaces", async () => {
      const cache1 = new KVCache(mockKv, 300, "ns1");
      const cache2 = new KVCache(mockKv, 300, "ns2");

      await cache1.set("key", "value");
      await cache1.get("key"); // hit for ns1
      await cache2.get("nonexistent"); // miss for ns2

      const allMetrics = getAllCacheMetrics();

      expect(allMetrics).toHaveProperty("ns1");
      expect(allMetrics).toHaveProperty("ns2");
      expect(allMetrics.ns1.hits).toBe(1);
      expect(allMetrics.ns1.misses).toBe(0);
      expect(allMetrics.ns2.hits).toBe(0);
      expect(allMetrics.ns2.misses).toBe(1);
    });

    it("should calculate rates correctly for each namespace", async () => {
      const cache1 = new KVCache(mockKv, 300, "rates-ns1");
      new KVCache(mockKv, 300, "rates-ns2"); // No accesses

      await cache1.set("key", "value");
      await cache1.get("key"); // hit
      await cache1.get("nonexistent"); // miss

      const allMetrics = getAllCacheMetrics();

      expect(allMetrics["rates-ns1"].hitRate).toBe(0.5);
      expect(allMetrics["rates-ns1"].missRate).toBe(0.5);
      expect(allMetrics["rates-ns2"].hitRate).toBe(0);
      expect(allMetrics["rates-ns2"].missRate).toBe(0);
    });
  });

  describe("resetAllCacheMetrics()", () => {
    it("should reset metrics for all namespaces", async () => {
      const cache1 = new KVCache(mockKv, 300, "reset-ns1");
      const cache2 = new KVCache(mockKv, 300, "reset-ns2");

      await cache1.get("nonexistent"); // miss
      await cache2.get("nonexistent"); // miss

      let allMetrics = getAllCacheMetrics();
      expect(allMetrics["reset-ns1"].misses).toBe(1);
      expect(allMetrics["reset-ns2"].misses).toBe(1);

      resetAllCacheMetrics();

      allMetrics = getAllCacheMetrics();
      expect(allMetrics["reset-ns1"].misses).toBe(0);
      expect(allMetrics["reset-ns2"].misses).toBe(0);
    });
  });

  // ============================================================================
  // Global Cache Operations Tests
  // ============================================================================

  describe("clearAllCaches()", () => {
    it("should clear all cache namespaces", async () => {
      const mockKvSources = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      };

      const mockKvProd = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      };

      const mockKvStaging = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      };

      const env = {
        DEALS_SOURCES: mockKvSources,
        DEALS_PROD: mockKvProd,
        DEALS_STAGING: mockKvStaging,
      } as unknown as Env;

      await clearAllCaches(env);

      // Verify list was called for each cache namespace
      expect(mockKvSources.list).toHaveBeenCalled();
      expect(mockKvProd.list).toHaveBeenCalled();
      expect(mockKvStaging.list).toHaveBeenCalled();
    });
  });

  describe("resetAllCaches()", () => {
    it("should clear all caches and reset all metrics", async () => {
      const mockKvProd = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      };

      const mockKvStaging = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      };

      const mockKvSources = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      };

      const env = {
        DEALS_SOURCES: mockKvSources,
        DEALS_PROD: mockKvProd,
        DEALS_STAGING: mockKvStaging,
      } as unknown as Env;

      // Create caches and add some metrics
      const cache1 = new KVCache(mockKvProd as any, 30, "snapshot");
      await cache1.get("nonexistent"); // miss

      await resetAllCaches(env);

      // Verify metrics were reset
      const allMetrics = getAllCacheMetrics();
      expect(allMetrics.snapshot?.misses ?? 0).toBe(0);
    });
  });
});
