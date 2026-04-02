import type { Env } from "../types";

// ============================================================================
// Cache Entry Types
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl_seconds: number;
}

// ============================================================================
// Cache Metrics
// ============================================================================

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  missRate: number;
}

// In-memory metrics storage (per-instance)
const metricsStore: Map<
  string,
  { hits: number; misses: number; evictions: number }
> = new Map();

// ============================================================================
// KV Cache Implementation
// ============================================================================

export class KVCache {
  private readonly kv: KVNamespace;
  private readonly defaultTtlSeconds: number;
  private readonly namespace: string;

  constructor(
    kv: KVNamespace,
    defaultTtlSeconds: number = 300,
    namespace: string = "cache",
  ) {
    this.kv = kv;
    this.defaultTtlSeconds = defaultTtlSeconds;
    this.namespace = namespace;

    // Initialize metrics for this namespace
    if (!metricsStore.has(namespace)) {
      metricsStore.set(namespace, { hits: 0, misses: 0, evictions: 0 });
    }
  }

  /**
   * Generate namespaced cache key
   */
  private key(key: string): string {
    return `cache:${this.namespace}:${key}`;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = await this.kv.get<CacheEntry<T>>(this.key(key), "json");

      if (!entry) {
        this.recordMiss();
        return null;
      }

      // Check if entry has expired
      const now = Date.now();
      const expiry = entry.timestamp + entry.ttl_seconds * 1000;

      if (now > expiry) {
        // Entry expired, delete it
        await this.delete(key);
        this.recordEviction();
        this.recordMiss();
        return null;
      }

      this.recordHit();
      return entry.data;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      this.recordMiss();
      return null;
    }
  }

  /**
   * Set cached value with optional TTL
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const effectiveTtl = ttlSeconds ?? this.defaultTtlSeconds;

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl_seconds: effectiveTtl,
    };

    try {
      await this.kv.put(this.key(key), JSON.stringify(entry), {
        expirationTtl: effectiveTtl,
      });
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(this.key(key));
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if key exists in cache (without incrementing metrics)
   */
  async has(key: string): Promise<boolean> {
    try {
      const entry = await this.kv.get<CacheEntry<unknown>>(
        this.key(key),
        "json",
      );

      if (!entry) return false;

      // Check if entry has expired
      const now = Date.now();
      const expiry = entry.timestamp + entry.ttl_seconds * 1000;

      if (now > expiry) {
        await this.delete(key);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Clear all cache entries in this namespace
   */
  async clear(): Promise<void> {
    try {
      const list = await this.kv.list({ prefix: `${this.namespace}:` });
      for (const key of list.keys) {
        await this.kv.delete(key.name);
      }
    } catch (error) {
      console.error("Cache clear error:", error);
      throw error;
    }
  }

  // ==========================================================================
  // Metrics Methods
  // ==========================================================================

  private recordHit(): void {
    const metrics = metricsStore.get(this.namespace);
    if (metrics) {
      metrics.hits++;
    }
  }

  private recordMiss(): void {
    const metrics = metricsStore.get(this.namespace);
    if (metrics) {
      metrics.misses++;
    }
  }

  private recordEviction(): void {
    const metrics = metricsStore.get(this.namespace);
    if (metrics) {
      metrics.evictions++;
    }
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    const metrics = metricsStore.get(this.namespace) || {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
    const total = metrics.hits + metrics.misses;

    return {
      hits: metrics.hits,
      misses: metrics.misses,
      evictions: metrics.evictions,
      hitRate: total > 0 ? metrics.hits / total : 0,
      missRate: total > 0 ? metrics.misses / total : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    metricsStore.set(this.namespace, { hits: 0, misses: 0, evictions: 0 });
  }
}

// ============================================================================
// Specialized Cache Factories
// ============================================================================

const TTL_SECONDS = {
  SOURCE: 300, // 5 minutes
  GITHUB: 60, // 1 minute
  ROBOTS_TXT: 3600, // 1 hour
  SNAPSHOT: 30, // 30 seconds
};

/**
 * Create cache for source registry
 * TTL: 5 minutes
 */
export function createSourceCache(env: Env): KVCache {
  return new KVCache(env.DEALS_SOURCES, TTL_SECONDS.SOURCE, "sources");
}

/**
 * Create cache for GitHub API responses
 * TTL: 1 minute
 */
export function createGitHubCache(env: Env): KVCache {
  return new KVCache(env.DEALS_PROD, TTL_SECONDS.GITHUB, "github");
}

/**
 * Create cache for robots.txt files
 * TTL: 1 hour
 */
export function createRobotsTxtCache(env: Env): KVCache {
  return new KVCache(env.DEALS_SOURCES, TTL_SECONDS.ROBOTS_TXT, "robots_txt");
}

/**
 * Create cache for production snapshots
 * TTL: 30 seconds
 */
export function createSnapshotCache(env: Env): KVCache {
  return new KVCache(env.DEALS_PROD, TTL_SECONDS.SNAPSHOT, "snapshot");
}

/**
 * Create cache for staging snapshots
 * TTL: 30 seconds
 */
export function createStagingSnapshotCache(env: Env): KVCache {
  return new KVCache(
    env.DEALS_STAGING,
    TTL_SECONDS.SNAPSHOT,
    "staging_snapshot",
  );
}

/**
 * Get all cache metrics across namespaces
 */
export function getAllCacheMetrics(): Record<string, CacheMetrics> {
  const result: Record<string, CacheMetrics> = {};

  for (const [namespace, metrics] of metricsStore.entries()) {
    const total = metrics.hits + metrics.misses;
    result[namespace] = {
      hits: metrics.hits,
      misses: metrics.misses,
      evictions: metrics.evictions,
      hitRate: total > 0 ? metrics.hits / total : 0,
      missRate: total > 0 ? metrics.misses / total : 0,
    };
  }

  return result;
}

/**
 * Reset all cache metrics
 */
export function resetAllCacheMetrics(): void {
  for (const namespace of metricsStore.keys()) {
    metricsStore.set(namespace, { hits: 0, misses: 0, evictions: 0 });
  }
}

/**
 * Clear all cache entries in all namespaces
 * Use with caution - primarily for testing
 */
export async function clearAllCaches(env: Env): Promise<void> {
  const caches = [
    createSourceCache(env),
    createSnapshotCache(env),
    createStagingSnapshotCache(env),
    createRobotsTxtCache(env),
  ];

  // GitHub cache uses DEALS_PROD which is also used by snapshot cache
  // so we don't need to clear it separately

  for (const cache of caches) {
    await cache.clear();
  }
}

/**
 * Reset all cache state (entries and metrics)
 * Use with caution - primarily for testing
 */
export async function resetAllCaches(env: Env): Promise<void> {
  await clearAllCaches(env);
  resetAllCacheMetrics();
}
