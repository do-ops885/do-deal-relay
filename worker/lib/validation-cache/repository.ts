// worker/lib/validation-cache/repository.ts
import type { ValidationCacheEntry } from "../../types/validation-cache";

type KVNamespaceLike = {
  get(
    key: string,
    options?: { type: "json"; cacheTtl?: number },
  ): Promise<unknown>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

/**
 * Repository providing KV storage access for validation cache entries.
 */
export class ValidationCacheRepository {
  constructor(private readonly kv: KVNamespaceLike) {}

  /**
   * Retrieves a cached validation entry by key.
   *
   * @param key KV cache key string
   * @returns Validation cache entry or null if missing/invalid
   */
  async get(key: string): Promise<ValidationCacheEntry | null> {
    const result = await this.kv.get(key, { type: "json", cacheTtl: 300 });
    return (result as ValidationCacheEntry) ?? null;
  }

  /**
   * Stores a validation entry in KV cache with explicit TTL.
   *
   * @param key KV cache key string
   * @param entry Validation entry payload to store
   * @param ttlSeconds Expiration time in seconds
   */
  async put(
    key: string,
    entry: ValidationCacheEntry,
    ttlSeconds: number,
  ): Promise<void> {
    await this.kv.put(key, JSON.stringify(entry), {
      expirationTtl: ttlSeconds,
    });
  }
}

/**
 * Calculates appropriate KV cache TTL in seconds based on validation decision status.
 *
 * @param status Validation decision status string
 * @returns TTL duration in seconds
 */
export function ttlForStatus(status: ValidationCacheEntry["status"]): number {
  switch (status) {
    case "accepted":
    case "duplicate":
      return 60 * 60 * 24;
    case "rejected":
      return 60 * 60 * 6;
    case "transient_error":
      return 60 * 15;
    default:
      return 60 * 60;
  }
}
