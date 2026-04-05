// worker/lib/validation-cache/repository.ts
import type { ValidationCacheEntry } from "../../types/validation-cache";

type KVNamespaceLike = {
  get(key: string, options?: { type: "json"; cacheTtl?: number }): Promise<any>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

export class ValidationCacheRepository {
  constructor(private readonly kv: KVNamespaceLike) {}

  async get(key: string): Promise<ValidationCacheEntry | null> {
    const result = await this.kv.get(key, { type: "json", cacheTtl: 300 });
    return result ?? null;
  }

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
