import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRateLimitBinding,
  checkRateLimitViaBinding,
} from "../../worker/lib/rate-limit-binding";
import { checkRateLimit } from "../../worker/lib/rate-limit";
import type { Env } from "../../worker/types";

function makeBinding(success: boolean): RateLimit {
  return {
    limit: vi.fn(async () => ({ success })),
  } as unknown as RateLimit;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  const kvStorage = new Map<string, string>();
  return {
    DEALS_LOCK: {
      get: vi.fn(async <T>(key: string, type?: string) => {
        const value = kvStorage.get(key);
        if (value === undefined) return null;
        if (type === "json") return JSON.parse(value) as T;
        return value as T;
      }),
      put: vi.fn(async (key: string, value: string) => {
        kvStorage.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        kvStorage.delete(key);
      }),
    } as unknown as KVNamespace,
    DEALS_PROD: {} as KVNamespace,
    DEALS_LOG: {} as KVNamespace,
    DEALS_STAGING: {} as KVNamespace,
    DEALS_SOURCES: {} as KVNamespace,
    DEALS_DB: {} as D1Database,
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    TRUST_THRESHOLD: "0.3",
    ...overrides,
  } as unknown as Env;
}

describe("Rate Limit Binding Selector", () => {
  describe("getRateLimitBinding", () => {
    it("maps 60s configs to the matching binding", () => {
      const binding = makeBinding(true);
      const env = makeEnv({ RL_10_60: binding });
      const result = getRateLimitBinding(env, {
        maxRequests: 10,
        windowSeconds: 60,
        keyPrefix: "ratelimit:submit",
      });
      expect(result).toBe(binding);
    });

    it("returns undefined for non-60s windows", () => {
      const env = makeEnv({ RL_5_60: makeBinding(true) });
      const result = getRateLimitBinding(env, {
        maxRequests: 5,
        windowSeconds: 300,
        keyPrefix: "ratelimit:discover",
      });
      expect(result).toBeUndefined();
    });

    it("returns undefined for unprovisioned limit values", () => {
      const env = makeEnv();
      const result = getRateLimitBinding(env, {
        maxRequests: 42,
        windowSeconds: 60,
        keyPrefix: "ratelimit:custom",
      });
      expect(result).toBeUndefined();
    });

    it("returns undefined when the binding is absent from env", () => {
      const env = makeEnv();
      const result = getRateLimitBinding(env, {
        maxRequests: 10,
        windowSeconds: 60,
        keyPrefix: "ratelimit:submit",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("checkRateLimitViaBinding", () => {
    it("passes prefix-qualified key to the binding", async () => {
      const binding = makeBinding(true);
      const env = makeEnv({ RL_20_60: binding });
      const outcome = await checkRateLimitViaBinding(env, "user:abc", {
        maxRequests: 20,
        windowSeconds: 60,
        keyPrefix: "ratelimit:research",
      });
      expect(outcome).toEqual({ success: true });
      expect(binding.limit).toHaveBeenCalledWith({
        key: "ratelimit:research:user:abc",
      });
    });

    it("returns undefined when no binding applies", async () => {
      const env = makeEnv();
      const outcome = await checkRateLimitViaBinding(env, "user:abc", {
        maxRequests: 20,
        windowSeconds: 60,
        keyPrefix: "ratelimit:research",
      });
      expect(outcome).toBeUndefined();
    });
  });
});

describe("checkRateLimit binding integration", () => {
  let env: Env;

  beforeEach(() => {
    env = makeEnv({
      RL_10_60: makeBinding(true),
      RL_5_60: makeBinding(true),
    });
  });

  it("allows via binding without touching KV", async () => {
    const result = await checkRateLimit(env, "user:1", "/api/submit");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(env.DEALS_LOCK.get).not.toHaveBeenCalled();
    expect(env.DEALS_LOCK.put).not.toHaveBeenCalled();
  });

  it("denies via binding with unchanged result shape", async () => {
    env = makeEnv({ RL_10_60: makeBinding(false) });
    const result = await checkRateLimit(env, "user:1", "/api/submit");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(10);
    expect(typeof result.resetTime).toBe("number");
  });

  it("uses KV path for 300s-window endpoints even when bindings exist", async () => {
    const result = await checkRateLimit(env, "user:1", "/api/discover");
    expect(result.allowed).toBe(true);
    expect(env.DEALS_LOCK.put).toHaveBeenCalled();
  });

  it("uses KV path for per-key custom configs", async () => {
    const result = await checkRateLimit(env, "user:1", "/api/submit", {
      maxRequests: 10,
      windowSeconds: 60,
      keyPrefix: "ratelimit:user",
    });
    expect(result.allowed).toBe(true);
    expect(env.DEALS_LOCK.put).toHaveBeenCalled();
  });

  it("falls back to KV when binding is absent", async () => {
    env = makeEnv();
    const result = await checkRateLimit(env, "user:1", "/api/submit");
    expect(result.allowed).toBe(true);
    expect(env.DEALS_LOCK.put).toHaveBeenCalled();
  });

  it("fails closed on binding error for sensitive endpoints", async () => {
    env = makeEnv({
      RL_10_60: {
        limit: vi.fn(async () => {
          throw new Error("binding unavailable");
        }),
      } as unknown as RateLimit,
    });
    const result = await checkRateLimit(env, "user:1", "/api/submit");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("falls back to KV on binding error for non-sensitive endpoints", async () => {
    env = makeEnv({
      RL_10_60: {
        limit: vi.fn(async () => {
          throw new Error("binding unavailable");
        }),
      } as unknown as RateLimit,
    });
    const result = await checkRateLimit(env, "user:1", "/api/nlq");
    expect(result.allowed).toBe(true);
    expect(env.DEALS_LOCK.put).toHaveBeenCalled();
  });
});
