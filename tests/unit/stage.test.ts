import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stage, prepareSnapshot } from "../../worker/pipeline/stage";
import type { Deal, PipelineContext, Env, Snapshot } from "../../worker/types";

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: "https://example.com/invite",
    domain: "example.com",
    discovered_at: "2024-03-31T00:00:00Z",
    trust_score: 0.7,
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
    confidence_score: 0.8,
    status: "active",
    ...overrides.metadata,
  },
  ...overrides,
});

describe("Staging Pipeline", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let ctx: PipelineContext;

  beforeEach(() => {
    mockKvStorage = new Map();
    ctx = {
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

    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`staging:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`staging:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`staging:${key}`);
        }),
      } as unknown as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("stage", () => {
    it("should build and stage snapshot", async () => {
      const deals = [
        createMockDeal("1"),
        createMockDeal("2", {
          metadata: {
            category: ["test"],
            tags: ["test"],
            normalized_at: "2024-03-31T00:00:00Z",
            confidence_score: 0.8,
            status: "quarantined",
          },
        }),
      ];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.snapshot).toBeDefined();
      expect(result.snapshot.run_id).toBe("test-run");
      expect(result.snapshot.trace_id).toBe("test-trace");
      expect(result.snapshot.deals).toHaveLength(2);
      expect(result.snapshot.stats.total).toBe(2);
      expect(result.snapshot.stats.active).toBe(1);
      expect(result.snapshot.stats.quarantined).toBe(1);
      expect(result.verified).toBe(true);
    });

    it("should calculate snapshot hash", async () => {
      const deals = [createMockDeal("1")];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.snapshot.snapshot_hash).toBeDefined();
      expect(result.snapshot.snapshot_hash).toHaveLength(64); // SHA-256 hex
    });

    it("should validate snapshot before writing", async () => {
      const deals = [createMockDeal("1")];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.verified).toBe(true);
    });

    it("should reject invalid snapshot", async () => {
      const invalidDeals = [
        {
          // Missing required fields
          id: "1",
        } as Deal,
      ];

      await expect(stage(invalidDeals, ctx, mockEnv)).rejects.toThrow();
    });

    it("should include version info", async () => {
      const deals = [createMockDeal("1")];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.snapshot.version).toBeDefined();
      expect(result.snapshot.schema_version).toBeDefined();
      expect(result.snapshot.generated_at).toBeDefined();
    });

    it("should calculate stats correctly", async () => {
      const deals = [
        createMockDeal("1", {
          metadata: {
            category: ["test"],
            tags: ["test"],
            normalized_at: "2024-03-31T00:00:00Z",
            confidence_score: 0.8,
            status: "active",
          },
        }),
        createMockDeal("2", {
          metadata: {
            category: ["test"],
            tags: ["test"],
            normalized_at: "2024-03-31T00:00:00Z",
            confidence_score: 0.8,
            status: "active",
          },
        }),
        createMockDeal("3", {
          metadata: {
            category: ["test"],
            tags: ["test"],
            normalized_at: "2024-03-31T00:00:00Z",
            confidence_score: 0.8,
            status: "quarantined",
          },
        }),
      ];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.snapshot.stats.total).toBe(3);
      expect(result.snapshot.stats.active).toBe(2);
      expect(result.snapshot.stats.quarantined).toBe(1);
    });

    it("should fail verification when read-after-write fails", async () => {
      // Mock staging get to return different data (simulating write failure)
      mockEnv.DEALS_STAGING.get = vi.fn(async () => null);

      const deals = [createMockDeal("1")];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.verified).toBe(false);
    });

    it("should handle empty deals array", async () => {
      const result = await stage([], ctx, mockEnv);

      expect(result.snapshot.deals).toHaveLength(0);
      expect(result.snapshot.stats.total).toBe(0);
    });

    it("should write to staging KV", async () => {
      const deals = [createMockDeal("1")];

      await stage(deals, ctx, mockEnv);

      expect(mockEnv.DEALS_STAGING.put).toHaveBeenCalledWith(
        "snapshot:staging",
        expect.any(String),
      );
    });
  });

  describe("prepareSnapshot", () => {
    it("should prepare snapshot for production", async () => {
      const deals = [
        createMockDeal("1"),
        createMockDeal("2", {
          metadata: {
            category: ["test"],
            tags: ["test"],
            normalized_at: "2024-03-31T00:00:00Z",
            confidence_score: 0.8,
            status: "active",
          },
        }),
      ];

      const snapshot = await prepareSnapshot(deals, ctx, "previous-hash");

      expect(snapshot.previous_hash).toBe("previous-hash");
      expect(snapshot.run_id).toBe("test-run");
      expect(snapshot.stats.rejected).toBe(0); // Rejected filtered out
    });

    it("should calculate hash for production snapshot", async () => {
      const deals = [createMockDeal("1")];

      const snapshot = await prepareSnapshot(deals, ctx, "");

      expect(snapshot.snapshot_hash).toBeDefined();
      expect(snapshot.snapshot_hash).toHaveLength(64);
    });

    it("should set correct timestamps", async () => {
      const before = Date.now();
      const deals = [createMockDeal("1")];

      const snapshot = await prepareSnapshot(deals, ctx, "");

      const after = Date.now();
      const generatedAt = new Date(snapshot.generated_at).getTime();

      expect(generatedAt).toBeGreaterThanOrEqual(before);
      expect(generatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe("Read-after-write verification", () => {
    it("should detect hash mismatch", async () => {
      // Setup staging to return different data
      let callCount = 0;
      mockEnv.DEALS_STAGING.get = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return null;
        return {
          run_id: "different-run",
          trace_id: "different-trace",
          snapshot_hash: "different-hash",
          deals: [],
        } as Snapshot;
      });

      const deals = [createMockDeal("1")];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.verified).toBe(false);
    });

    it("should detect count mismatch", async () => {
      let callCount = 0;
      mockEnv.DEALS_STAGING.get = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return null;
        return {
          run_id: "test-run",
          trace_id: "test-trace",
          snapshot_hash: "any-hash",
          deals: [createMockDeal("1"), createMockDeal("2")], // Different count
        } as Snapshot;
      });

      const deals = [createMockDeal("1")];

      const result = await stage(deals, ctx, mockEnv);

      expect(result.verified).toBe(false);
    });
  });
});
