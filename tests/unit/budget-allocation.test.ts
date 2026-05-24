import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discover } from "../../worker/pipeline/discover";
import type { PipelineContext, Env, SourceConfig } from "../../worker/types";
import { logger } from "../../worker/lib/global-logger";

describe("Budget Allocation", () => {
  const ctx: PipelineContext = {
    run_id: "test-run",
    trace_id: "test-trace",
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0,
  };

  let mockKvStorage: Map<string, unknown>;

  beforeEach(() => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(logger, "info");
    vi.spyOn(logger, "warn");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const createMockSource = (
    overrides: Partial<SourceConfig> = {},
  ): SourceConfig => ({
    domain: "example.com",
    url_patterns: ["/page"],
    trust_initial: 0.7,
    classification: "probationary",
    active: true,
    ...overrides,
  });

  const createMockEnv = (
    sources: SourceConfig[],
    vars: Record<string, string> = {},
  ): Env => {
    mockKvStorage.set("registry", sources);
    return {
      DEALS_PROD: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {
        get: vi.fn(async <T>(key: string) => mockKvStorage.get(key) as T),
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
      ...vars,
    } as unknown as Env;
  };

  it("should sort sources by trust score descending", async () => {
    const sources = [
      createMockSource({ domain: "low.com", trust_initial: 0.4 }),
      createMockSource({ domain: "high.com", trust_initial: 0.9 }),
      createMockSource({ domain: "mid.com", trust_initial: 0.6 }),
    ];
    const env = createMockEnv(sources);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "[]",
    });
    vi.stubGlobal("fetch", mockFetch);

    await discover(env, ctx);

    // Verify order of calls to fetch
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://high.com/page",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://mid.com/page",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "https://low.com/page",
      expect.any(Object),
    );
  });

  it("should skip sources with trust below 0.3", async () => {
    const sources = [
      createMockSource({ domain: "trusted.com", trust_initial: 0.5 }),
      createMockSource({ domain: "untrusted.com", trust_initial: 0.2 }),
    ];
    const env = createMockEnv(sources);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "[]",
    });
    vi.stubGlobal("fetch", mockFetch);

    await discover(env, ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://trusted.com/page",
      expect.any(Object),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Skipping source untrusted.com"),
      expect.any(Object),
    );
  });

  it("should respect per-source budget and high-trust bonus", async () => {
    const sources = [
      createMockSource({ domain: "high-trust.com", trust_initial: 0.8 }), // Should get 10 (base) + 5 (bonus) = 15
      createMockSource({ domain: "mid-trust.com", trust_initial: 0.5 }), // Should get 10 (base) = 10
    ];

    const env = createMockEnv(sources, {
      CANDIDATE_BUDGET_PER_SOURCE: "10",
      CANDIDATE_BUDGET_HIGH_TRUST_BONUS: "5",
      CANDIDATE_BUDGET_GLOBAL: "100",
    });

    const generateDeals = (count: number) =>
      JSON.stringify(
        Array.from({ length: count }, (_, i) => ({
          code: `CODE${i}`,
          reward_value: 10,
        })),
      );

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => generateDeals(20), // Source has 20, but budget is 15
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => generateDeals(20), // Source has 20, but budget is 10
      });
    vi.stubGlobal("fetch", mockFetch);

    const result = await discover(env, ctx);

    expect(result.deals).toHaveLength(25); // 15 + 10
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Allocating budget for high-trust.com"),
      expect.objectContaining({ budget: 15 }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Allocating budget for mid-trust.com"),
      expect.objectContaining({ budget: 10 }),
    );
  });

  it("should respect global budget", async () => {
    const sources = [
      createMockSource({ domain: "s1.com", trust_initial: 0.9 }),
      createMockSource({ domain: "s2.com", trust_initial: 0.8 }),
      createMockSource({ domain: "s3.com", trust_initial: 0.7 }),
    ];

    const env = createMockEnv(sources, {
      CANDIDATE_BUDGET_PER_SOURCE: "50",
      CANDIDATE_BUDGET_GLOBAL: "15",
    });

    const generateDeals = (count: number) =>
      JSON.stringify(
        Array.from({ length: count }, (_, i) => ({
          code: `CODE${i}`,
          reward_value: 10,
        })),
      );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => generateDeals(20),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await discover(env, ctx);

    expect(result.deals).toHaveLength(15);
    expect(mockFetch).toHaveBeenCalledTimes(1); // First source fills the global budget (it had 20, but budget was 15)
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Global discovery budget exhausted"),
      expect.any(Object),
    );
  });

  it("should use default budget values when env vars are missing", async () => {
    const sources = [
      createMockSource({ domain: "default.com", trust_initial: 0.5 }),
    ];
    const env = createMockEnv(sources); // No budget env vars

    const generateDeals = (count: number) =>
      JSON.stringify(
        Array.from({ length: count }, (_, i) => ({
          code: `CODE${i}`,
          reward_value: 10,
        })),
      );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => generateDeals(150),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await discover(env, ctx);

    // Default PER_SOURCE is 100
    expect(result.deals).toHaveLength(100);
  });
});
