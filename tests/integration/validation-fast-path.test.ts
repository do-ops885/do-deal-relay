// tests/integration/validation-fast-path.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateDealFastPath } from "../../worker/pipeline/validate-fast-path";
import { Env } from "../../worker/types";

describe("validateDealFastPath", () => {
  let mockKv: any;
  let mockDb: any;
  let env: Env;

  beforeEach(() => {
    mockKv = {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn(),
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    };
    env = {
      DEALS_STAGING: mockKv,
      DEALS_DB: mockDb,
    } as unknown as Env;
  });

  it("returns hit: false and persist function on cache miss", async () => {
    mockKv.get.mockResolvedValue(null);
    mockDb.prepare().bind().first.mockResolvedValue(null);

    const result = await validateDealFastPath(env, {
      url: "https://example.com/deal?utm_source=test",
      fingerprint: "fp1",
    });

    expect(result.hit).toBe(false);
    expect(result.source).toBe("none");
    expect(result.persist).toBeTypeOf("function");
  });

  it("returns hit: true when URL is cached in KV", async () => {
    const cachedEntry = {
      status: "accepted",
      fingerprint: "fp1",
      normalizedUrl: "https://example.com/deal",
      createdAt: new Date().toISOString(),
    };
    // Mock URL cache key lookup
    mockKv.get.mockImplementation((key: string) => {
      if (key.startsWith("v:url:")) return Promise.resolve(cachedEntry);
      return Promise.resolve(null);
    });

    const result = await validateDealFastPath(env, {
      url: "https://example.com/deal",
      fingerprint: "fp1",
    });

    expect(result.hit).toBe(true);
    expect(result.source).toBe("kv:url");
    expect(result.decision).toEqual(cachedEntry);
  });

  it("returns hit: true when fingerprint is cached as duplicate in KV", async () => {
    const cachedEntry = {
      status: "duplicate",
      fingerprint: "fp1",
      normalizedUrl: "https://example.com/deal",
      createdAt: new Date().toISOString(),
    };
    mockKv.get.mockImplementation((key: string) => {
      if (key.startsWith("v:fingerprint:")) return Promise.resolve(cachedEntry);
      return Promise.resolve(null);
    });

    const result = await validateDealFastPath(env, {
      url: "https://other.com/deal",
      fingerprint: "fp1",
    });

    expect(result.hit).toBe(true);
    expect(result.source).toBe("kv:fingerprint");
    expect(result.decision).toEqual(cachedEntry);
  });

  it("returns hit: true and populates KV when found in D1", async () => {
    const indexedEntry = {
      status: "accepted",
      fingerprint: "fp1",
      normalized_url: "https://example.com/deal",
      trust_score: 0.9,
    };
    mockKv.get.mockResolvedValue(null);
    mockDb.prepare().bind().first.mockResolvedValue(indexedEntry);

    const result = await validateDealFastPath(env, {
      url: "https://example.com/deal",
      fingerprint: "fp1",
    });

    expect(result.hit).toBe(true);
    expect(result.source).toBe("d1");
    expect(result.decision?.status).toBe("accepted");
    expect(mockKv.put).toHaveBeenCalledTimes(2); // URL and Fingerprint keys
  });
});
