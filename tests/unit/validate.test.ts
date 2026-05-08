import { describe, it, expect } from "vitest";
import {
  validate,
  calculateValidationRatio,
} from "../../worker/pipeline/validate";
import type { Deal, PipelineContext, Env } from "../../worker/types";

// Cloudflare Workers KV namespace type
type KVNamespace = {
  get: <T>(key: string, type?: string) => Promise<T | null>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list?: () => Promise<{ keys: { name: string }[] }>;
};

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: "https://example.com/invite",
    domain: "example.com",
    discovered_at: "2024-03-31T00:00:00Z",
    trust_score: 0.7,
    ...overrides.source,
  },
  title: "Test Deal",
  description: "Test description",
  code: "CODE123",
  url: "https://example.com/invite/CODE123",
  reward: {
    type: "cash",
    value: 50,
    currency: "USD",
    ...overrides.reward,
  },
  expiry: {
    confidence: 0.8,
    type: "soft",
    ...overrides.expiry,
  },
  metadata: {
    category: ["test"],
    tags: ["test"],
    normalized_at: "2024-03-31T00:00:00Z",
    confidence_score: 0.8,
    status: "active",
    ...overrides.metadata,
  },
});

describe("Validation Pipeline", () => {
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

  const mockEnv = {
    DEALS_PROD: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    } as unknown as KVNamespace,
    DEALS_STAGING: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    } as unknown as KVNamespace,
    DEALS_LOG: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [] }),
    } as unknown as KVNamespace,
    DEALS_LOCK: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    } as unknown as KVNamespace,
    DEALS_SOURCES: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    } as unknown as KVNamespace,
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as Env;

  it("should validate good deals", async () => {
    const deals = [createMockDeal("1")];
    const result = await validate(deals, ctx, mockEnv);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(0);
  });

  it("should reject deals with low trust", async () => {
    const deals = [
      createMockDeal("1", {
        source: {
          trust_score: 0.1,
          url: "https://example.com/invite",
          domain: "example.com",
          discovered_at: "2024-03-31T00:00:00Z",
        },
      }),
    ];
    const result = await validate(deals, ctx, mockEnv);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it("should quarantine high-value low-trust deals", async () => {
    const deals = [
      createMockDeal("1", {
        source: {
          trust_score: 0.4,
          url: "https://example.com/invite",
          domain: "example.com",
          discovered_at: "2024-03-31T00:00:00Z",
        },
        reward: { type: "cash", value: 150, currency: "USD" },
      }),
    ];
    const result = await validate(deals, ctx, mockEnv);
    expect(result.quarantined.length).toBeGreaterThan(0);
  });

  it("should calculate validation ratio", () => {
    const result = {
      stats: {
        total: 10,
        valid: 8,
        quarantined: 1,
        invalid: 1,
        by_gate: {},
      },
      valid: [],
      invalid: [],
      quarantined: [],
    };
    const ratio = calculateValidationRatio(result);
    expect(ratio).toBe(0.8);
  });

  it("should record gate-level metrics correctly for multiple rejections", async () => {
    // Custom metrics object to track
    const testMetrics = {
      run_id: "test-run",
      start_time: Date.now(),
      phase_timings: {
        init: 0,
        discover: 0,
        normalize: 0,
        dedupe: 0,
        validate: 0,
        score: 0,
        stage: 0,
        publish: 0,
        verify: 0,
        finalize: 0,
      },
      total_duration_ms: 0,
      deals_processed: {
        discovered: 0,
        normalized: 0,
        deduped: 0,
        validated: 0,
        scored: 0,
        published: 0,
      },
      validation_gates: {
        schema_validation: { passed: 0, failed: 0 },
        source_trust: { passed: 0, failed: 0 },
        reward_plausibility: { passed: 0, failed: 0 },
      },
      errors: 0,
      retries: 0,
      success: false,
      final_phase: "init" as any,
    };

    const multiFailureCtx = {
      ...ctx,
      metrics: testMetrics,
    };

    const deals = [
      createMockDeal("1", {
        source: {
          trust_score: 0.1,
          url: "http://bad.com",
          domain: "bad.com",
          discovered_at: new Date().toISOString(),
        }, // Fails source_trust
        reward: { type: "cash", value: -10 }, // Fails reward_plausibility
      }),
    ];

    await validate(deals, multiFailureCtx, mockEnv);

    // Both gates should have recorded a failure
    expect(testMetrics.validation_gates.source_trust.failed).toBe(1);
    expect(testMetrics.validation_gates.reward_plausibility.failed).toBe(1);

    // Schema validation should have passed
    expect(testMetrics.validation_gates.schema_validation.passed).toBe(1);
  });
});
