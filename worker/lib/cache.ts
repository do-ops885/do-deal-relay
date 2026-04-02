/**
 * Cache - Simple KV-based caching layer
 */

import type { Env } from "../types";

export interface CacheConfig {
  ttlSeconds: number;
  namespace?: string;
}

export class Cache {
  private prefix: string;

  constructor(
    private env: Env,
    private config: CacheConfig,
  ) {
    this.prefix = config.namespace ? `${config.namespace}:` : "";
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = `${this.prefix}${key}`;
    const data = await this.env.DEALS_SOURCES.get(fullKey, "json");

    if (!data) return null;

    const entry = data as { value: T; expires: number };
    if (Date.now() > entry.expires) {
      await this.env.DEALS_SOURCES.delete(fullKey);
      return null;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    const entry = {
      value,
      expires: Date.now() + this.config.ttlSeconds * 1000,
    };
    await this.env.DEALS_SOURCES.put(fullKey, JSON.stringify(entry));
  }

  async delete(key: string): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    await this.env.DEALS_SOURCES.delete(fullKey);
  }
}

export function createCache(env: Env, config: CacheConfig): Cache {
  return new Cache(env, config);
}
