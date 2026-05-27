// tests/integration/validation-fast-path.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { validateDealFastPath } from "../../worker/pipeline/validate-fast-path";
import { Env, PipelineMetrics } from "../../worker/types";
import * as metricsModule from "../../worker/lib/metrics";

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
      DEALS_PROD: mockKv,
      DEALS_LOG: mockKv,
      DEALS_LOCK: mockKv,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      TRUST_THRESHOLD: "0.3",
    } as unknown as Env;
    vi.spyOn(metricsModule, "recordValidationCacheMetric").mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("returns hit:true kv:url when URL is cached as rejected", async () => {
    const cachedEntry = {
      status: "rejected",
      reason: "low trust score",
      fingerprint: "fp2",
      normalizedUrl: "https://example.com/bad-deal",
      createdAt: new Date().toISOString(),
    };
    mockKv.get.mockImplementation((key: string) => {
      if (key.startsWith("v:url:")) return Promise.resolve(cachedEntry);
      return Promise.resolve(null);
    });

    const result = await validateDealFastPath(env, {
      url: "https://example.com/bad-deal",
      fingerprint: "fp2",
    });

    expect(result.hit).toBe(true);
    expect(result.source).toBe("kv:url");
    expect(result.decision?.status).toBe("rejected");
    expect(result.decision?.reason).toBe("low trust score");
  });

  it("ignores fingerprint cache when status is not duplicate", async () => {
    // Fingerprint has accepted status (not duplicate) — should NOT match kv:fingerprint
    const fpEntry = {
      status: "accepted",
      fingerprint: "fp-accepted",
      normalizedUrl: "https://example.com/accepted",
      createdAt: new Date().toISOString(),
    };
    // URL is not cached, D1 returns null — so it falls through to miss
    mockKv.get.mockImplementation((key: string) => {
      if (key.startsWith("v:fingerprint:")) return Promise.resolve(fpEntry);
      return Promise.resolve(null);
    });
    mockDb.prepare().bind().first.mockResolvedValue(null);

    const result = await validateDealFastPath(env, {
      url: "https://example.com/other",
      fingerprint: "fp-accepted",
    });

    // Should NOT match kv:fingerprint because status is "accepted", not "duplicate"
    expect(result.hit).toBe(false);
    expect(result.source).toBe("none");
    expect(result.persist).toBeTypeOf("function");
  });

  it("returns early with hit:false when KV binding is missing", async () => {
    const noKvEnv = {
      ...env,
      DEALS_STAGING: undefined,
    } as unknown as Env;

    const result = await validateDealFastPath(noKvEnv, {
      url: "https://example.com/deal",
      fingerprint: "fp-any",
    });

    expect(result.hit).toBe(false);
    expect(result.source).toBe("none");
    expect(result.decision).toBeUndefined();
    expect(result.persist).toBeUndefined();
    expect(mockKv.get).not.toHaveBeenCalled();
  });

  it("returns early with hit:false when DB binding is missing", async () => {
    const noDbEnv = {
      ...env,
      DEALS_DB: undefined,
    } as unknown as Env;

    const result = await validateDealFastPath(noDbEnv, {
      url: "https://example.com/deal",
      fingerprint: "fp-any",
    });

    expect(result.hit).toBe(false);
    expect(result.source).toBe("none");
    expect(mockKv.get).not.toHaveBeenCalled();
  });

  it("persist function writes to KV cache and D1 index", async () => {
    mockKv.get.mockResolvedValue(null);
    mockDb.prepare().bind().first.mockResolvedValue(null);

    const result = await validateDealFastPath(env, {
      url: "https://example.com/new-deal",
      fingerprint: "fp-new",
      source: "email",
      traceId: "trace-123",
    });

    expect(result.hit).toBe(false);
    expect(result.source).toBe("none");
    expect(result.persist).toBeTypeOf("function");

    await result.persist!({
      status: "accepted",
      reason: "passes all gates",
      trustScore: 0.95,
    });

    // Should write to both KV keys (url + fingerprint) and D1
    expect(mockKv.put).toHaveBeenCalledTimes(2);
    expect(mockDb.prepare).toHaveBeenCalled();

    // Verify KV put was called with proper arguments
    const putCalls = mockKv.put.mock.calls;
    expect(putCalls.length).toBe(2);
    putCalls.forEach(([key, value]: [string, string]) => {
      expect(key).toMatch(/^v:(url|fingerprint):/);
      const parsed = JSON.parse(value);
      expect(parsed.fingerprint).toBe("fp-new");
      expect(parsed.status).toBe("accepted");
      expect(parsed.source).toBe("email");
      expect(parsed.traceId).toBe("trace-123");
    });
  });

  describe("URL normalization and key building", () => {
    it("normalizes URL by stripping tracking params", async () => {
      mockKv.get.mockResolvedValue(null);
      mockDb.prepare().bind().first.mockResolvedValue(null);

      // URL with UTM params — should be normalized before key lookup
      await validateDealFastPath(env, {
        url: "https://example.com/deal?utm_source=twitter&offer=50",
        fingerprint: "fp-normalize",
      });

      // KV.get should have been called with URL and fingerprint keys
      const getCalls = mockKv.get.mock.calls;
      const urlKey = getCalls.find(([k]: [string]) => k.startsWith("v:url:"));
      const fpKey = getCalls.find(([k]: [string]) =>
        k.startsWith("v:fingerprint:"),
      );

      expect(urlKey).toBeDefined();
      expect(fpKey).toBeDefined();
      // urlKey should be deterministic: same URL without utm params = same hash
      expect(urlKey[0]).toMatch(/^v:url:[a-f0-9]{64}$/);
    });

    it("produces consistent keys for equivalent URLs", async () => {
      mockKv.get.mockResolvedValue(null);
      mockDb.prepare().bind().first.mockResolvedValue(null);

      await validateDealFastPath(env, {
        url: "https://example.com/deal?offer=50&utm_campaign=spring",
        fingerprint: "fp-key-consistency",
      });
      await validateDealFastPath(env, {
        url: "https://Example.com/deal?offer=50&utm_campaign=spring",
        fingerprint: "fp-key-consistency-2",
      });

      const calls = mockKv.get.mock.calls;
      const urlKey1 = calls.find(([k]: [string]) => k.startsWith("v:url:"));
      // Both calls should produce the same urlKey (hostname lowercase, utm stripped)
      const matchingCalls = calls.filter(
        ([k]: [string]) => k.startsWith("v:url:") && k === urlKey1[0],
      );
      // At least 2 calls used the same url key (both URLs normalize the same)
      expect(matchingCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("metrics tracking", () => {
    it("records hit_total metric on kv:url cache hit", async () => {
      const cachedEntry = {
        status: "accepted",
        fingerprint: "fp-metrics",
        normalizedUrl: "https://example.com/metrics-deal",
        createdAt: new Date().toISOString(),
      };
      mockKv.get.mockImplementation((key: string) => {
        if (key.startsWith("v:url:")) return Promise.resolve(cachedEntry);
        return Promise.resolve(null);
      });

      await validateDealFastPath(env, {
        url: "https://example.com/metrics-deal",
        fingerprint: "fp-metrics",
        metrics: {
          run_id: "test-run-1",
          start_time: 1000,
          success: false,
        } as unknown as PipelineMetrics,
      });

      expect(metricsModule.recordValidationCacheMetric).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: "test-run-1" }),
        "hit_total",
        1,
      );
    });

    it("records hit_total and dedup_hit_total on kv:fingerprint duplicate hit", async () => {
      const duplicateEntry = {
        status: "duplicate",
        fingerprint: "fp-dupe",
        normalizedUrl: "https://example.com/dupe",
        createdAt: new Date().toISOString(),
      };
      mockKv.get.mockImplementation((key: string) => {
        if (key.startsWith("v:fingerprint:"))
          return Promise.resolve(duplicateEntry);
        return Promise.resolve(null);
      });

      await validateDealFastPath(env, {
        url: "https://example.com/other",
        fingerprint: "fp-dupe",
        metrics: {
          run_id: "test-run-2",
          start_time: 1000,
          success: false,
        } as unknown as PipelineMetrics,
      });

      expect(metricsModule.recordValidationCacheMetric).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: "test-run-2" }),
        "hit_total",
        1,
      );
      expect(metricsModule.recordValidationCacheMetric).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: "test-run-2" }),
        "dedup_hit_total",
        1,
      );
    });

    it("records miss_total metric when nothing is cached", async () => {
      mockKv.get.mockResolvedValue(null);
      mockDb.prepare().bind().first.mockResolvedValue(null);

      await validateDealFastPath(env, {
        url: "https://example.com/miss",
        fingerprint: "fp-miss",
        metrics: {
          run_id: "test-run-3",
          start_time: 1000,
          success: false,
        } as unknown as PipelineMetrics,
      });

      expect(metricsModule.recordValidationCacheMetric).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: "test-run-3" }),
        "miss_total",
        1,
      );
    });

    it("records d1_lookup_total metric on D1 record found", async () => {
      const indexedEntry = {
        status: "accepted",
        fingerprint: "fp-d1-metrics",
        normalized_url: "https://example.com/d1-metrics",
      };
      mockKv.get.mockResolvedValue(null);
      mockDb.prepare().bind().first.mockResolvedValue(indexedEntry);

      await validateDealFastPath(env, {
        url: "https://example.com/d1-metrics",
        fingerprint: "fp-d1-metrics",
        metrics: {
          run_id: "test-run-4",
          start_time: 1000,
          success: false,
        } as unknown as PipelineMetrics,
      });

      expect(metricsModule.recordValidationCacheMetric).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: "test-run-4" }),
        "d1_lookup_total",
        1,
      );
    });

    it("records write_total metric when persist completes", async () => {
      mockKv.get.mockResolvedValue(null);
      mockDb.prepare().bind().first.mockResolvedValue(null);

      const result = await validateDealFastPath(env, {
        url: "https://example.com/persist-metrics",
        fingerprint: "fp-persist-metrics",
        metrics: {
          run_id: "test-run-5",
          start_time: 1000,
          success: false,
        } as unknown as PipelineMetrics,
      });

      await result.persist!({
        status: "accepted",
      });

      expect(metricsModule.recordValidationCacheMetric).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: "test-run-5" }),
        "write_total",
        1,
      );
    });

    it("does not record metrics when metrics input is undefined", async () => {
      mockKv.get.mockResolvedValue(null);
      mockDb.prepare().bind().first.mockResolvedValue(null);

      await validateDealFastPath(env, {
        url: "https://example.com/no-metrics",
        fingerprint: "fp-no-metrics",
      });

      expect(metricsModule.recordValidationCacheMetric).not.toHaveBeenCalled();
    });
  });
});
