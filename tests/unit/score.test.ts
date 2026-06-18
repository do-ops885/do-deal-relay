import { describe, it, expect, vi } from "vitest";
import {
  score,
  calculateSourceDiversity,
  calculateUniquenessScore,
} from "../../worker/pipeline/score";
import type { Deal, PipelineContext, Env } from "../../worker/types";

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: overrides.source?.url || "https://example.com/invite",
    domain: overrides.source?.domain || "example.com",
    discovered_at: overrides.source?.discovered_at || "2024-03-31T00:00:00Z",
    trust_score:
      overrides.source?.trust_score !== undefined
        ? overrides.source.trust_score
        : 0.7,
  },
  title: "Test Deal",
  description: "Test description",
  code: "CODE123",
  url: "https://example.com/invite/CODE123",
  reward: {
    type: "cash",
    value: 50,
    currency: "USD",
  },
  expiry: {
    confidence: 0.8,
    type: "soft",
  },
  metadata: {
    category: ["test"],
    tags: ["test"],
    normalized_at: "2024-03-31T00:00:00Z",
    confidence_score: 0.5,
    status: "active",
  },
});

describe("Scoring Pipeline", () => {
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
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    } as unknown as KVNamespace,
    DEALS_STAGING: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    } as unknown as KVNamespace,
    DEALS_LOG: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
    } as unknown as KVNamespace,
    DEALS_LOCK: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    } as unknown as KVNamespace,
    DEALS_SOURCES: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
    } as unknown as KVNamespace,
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as unknown as Env;

  it("should calculate confidence scores", async () => {
    const deals = [createMockDeal("1")];
    const result = await score(deals, ctx, mockEnv);
    expect(result.deals).toHaveLength(1);
    expect(result.deals[0]!.metadata.confidence_score).toBeGreaterThan(0);
  });

  it("should calculate statistics", async () => {
    const deals = [createMockDeal("1"), createMockDeal("2")];
    const result = await score(deals, ctx, mockEnv);
    expect(result.stats.avg_confidence).toBeGreaterThan(0);
    expect(result.stats.min_confidence).toBeGreaterThanOrEqual(0);
    expect(result.stats.max_confidence).toBeGreaterThan(0);
  });

  describe("calculateSourceDiversity", () => {
    it("should return 0 for empty deals", () => {
      expect(calculateSourceDiversity([])).toBe(0);
    });

    it("should calculate diversity ratio correctly", () => {
      const deals = [
        createMockDeal("1", {
          source: { domain: "a.com", trust_score: 0.7 } as any,
        }),
        createMockDeal("2", {
          source: { domain: "b.com", trust_score: 0.7 } as any,
        }),
      ];
      expect(calculateSourceDiversity(deals)).toBeCloseTo(0.4);
    });

    it("should cap diversity at 1.0", () => {
      const deals = [
        createMockDeal("1", {
          source: { domain: "a.com", trust_score: 0.7 } as any,
        }),
        createMockDeal("2", {
          source: { domain: "b.com", trust_score: 0.7 } as any,
        }),
        createMockDeal("3", {
          source: { domain: "c.com", trust_score: 0.7 } as any,
        }),
        createMockDeal("4", {
          source: { domain: "d.com", trust_score: 0.7 } as any,
        }),
        createMockDeal("5", {
          source: { domain: "e.com", trust_score: 0.7 } as any,
        }),
      ];
      expect(calculateSourceDiversity(deals)).toBeCloseTo(1.0);
    });
  });

  describe("calculateUniquenessScore", () => {
    it("should return 1.0 for zero candidates", () => {
      expect(calculateUniquenessScore(0, 0)).toBe(1.0);
    });

    it("should calculate uniqueness ratio correctly", () => {
      expect(calculateUniquenessScore(2, 10)).toBe(0.8);
    });

    it("should return 0.0 when all are duplicates", () => {
      expect(calculateUniquenessScore(10, 10)).toBe(0);
    });
  });
});
