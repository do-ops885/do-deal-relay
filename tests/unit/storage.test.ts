import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProductionSnapshot,
  getStagingSnapshot,
  writeStagingSnapshot,
  promoteToProduction,
  revertProduction,
  getSourceRegistry,
  updateSourceRegistry,
  getSourceConfig,
  updateSourceTrust,
  recordSourceValidation,
  getDealById,
  getDealsByCode,
  getDealsByCategory,
  getActiveDeals,
  getQuarantinedDeals,
  setLastRunMetadata,
  getLastRunMetadata,
  clearStaging,
} from "../../worker/lib/storage";
import type { Deal, Snapshot, SourceConfig, Env } from "../../worker/types";

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: "https://example.com/invite",
    domain: "example.com",
    discovered_at: "2024-03-31T00:00:00Z",
    trust_score: overrides.source?.trust_score || 0.7,
  },
  title: overrides.title ?? "Test Deal",
  description: overrides.description ?? "Test description",
  code: overrides.code ?? "CODE123",
  url: overrides.url ?? "https://example.com/invite/CODE123",
  reward: overrides.reward ?? {
    type: "cash",
    value: 50,
    currency: "USD",
  },
  expiry: overrides.expiry ?? {
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
});

const createMockSnapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  version: "1.0.0",
  generated_at: "2024-03-31T00:00:00Z",
  run_id: "test-run",
  trace_id: "test-trace",
  snapshot_hash: "abc123",
  previous_hash: "xyz789",
  schema_version: "1.0.0",
  stats: {
    total: 1,
    active: 1,
    quarantined: 0,
    rejected: 0,
    duplicates: 0,
  },
  deals: [createMockDeal("1")],
  ...overrides,
});

const createMockSource = (
  overrides: Partial<SourceConfig> = {},
): SourceConfig => ({
  domain: "example.com",
  url_patterns: ["/referral"],
  trust_initial: 0.7,
  classification: "probationary",
  active: true,
  ...overrides,
});

describe("Storage Layer", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`prod:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`prod:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`prod:${key}`);
        }),
      } as unknown as KVNamespace,
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
        list: vi.fn(async () => {
          const keys: { name: string }[] = [];
          mockKvStorage.forEach((_, key) => {
            if (key.startsWith("staging:")) {
              keys.push({ name: key.replace("staging:", "") });
            }
          });
          return { keys };
        }),
      } as unknown as KVNamespace,
      DEALS_LOG: {
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_LOCK: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`sources:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`sources:${key}`, value);
        }),
      } as unknown as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  describe("Production snapshot operations", () => {
    it("should get production snapshot", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getProductionSnapshot(mockEnv);

      expect(result).toEqual(snapshot);
    });

    it("should return null when production snapshot not found", async () => {
      const result = await getProductionSnapshot(mockEnv);

      expect(result).toBeNull();
    });

    it("should handle errors gracefully", async () => {
      mockKvStorage.set("prod:snapshot:prod", "invalid json");

      const result = await getProductionSnapshot(mockEnv);

      expect(result).toBeNull();
    });
  });

  describe("Staging snapshot operations", () => {
    it("should get staging snapshot", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      const result = await getStagingSnapshot(mockEnv);

      expect(result).toEqual(snapshot);
    });

    it("should return null when staging snapshot not found", async () => {
      const result = await getStagingSnapshot(mockEnv);

      expect(result).toBeNull();
    });

    it("should write staging snapshot with hash", async () => {
      const snapshot = createMockSnapshot();
      const { snapshot_hash, ...snapshotWithoutHash } = snapshot;

      const result = await writeStagingSnapshot(mockEnv, snapshotWithoutHash);

      expect(result.snapshot_hash).toBeDefined();
      expect(result.snapshot_hash).not.toBe(snapshot_hash);
      expect(mockEnv.DEALS_STAGING.put).toHaveBeenCalled();
    });

    it("should validate snapshot before writing", async () => {
      const invalidSnapshot = {
        version: "1.0.0",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test",
        trace_id: "test",
        previous_hash: "",
        schema_version: "1.0.0",
        stats: {
          total: 0,
          active: 0,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        // Missing required fields
      } as unknown as Omit<Snapshot, "snapshot_hash">;

      await expect(
        writeStagingSnapshot(mockEnv, invalidSnapshot),
      ).rejects.toThrow();
    });

    it("should clear staging data", async () => {
      mockKvStorage.set("staging:key1", "value1");
      mockKvStorage.set("staging:key2", "value2");

      await clearStaging(mockEnv);

      expect(mockEnv.DEALS_STAGING.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe("Promote to production", () => {
    it("should promote staging to production with valid hash", async () => {
      // First set up production snapshot
      const prodSnapshot = createMockSnapshot({ snapshot_hash: "prod-hash" });
      mockKvStorage.set("prod:snapshot:prod", prodSnapshot);

      const stagingSnapshot = createMockSnapshot({
        snapshot_hash: "staging-hash",
        previous_hash: "prod-hash",
      });
      mockKvStorage.set("staging:snapshot:staging", stagingSnapshot);

      const result = await promoteToProduction(mockEnv, "prod-hash");

      expect(result.snapshot_hash).toBe("staging-hash");
      expect(mockEnv.DEALS_PROD.put).toHaveBeenCalled();
    });

    it("should throw when staging snapshot not found", async () => {
      await expect(promoteToProduction(mockEnv, "any-hash")).rejects.toThrow(
        "No staging snapshot found",
      );
    });

    it("should verify hash chain", async () => {
      const prodSnapshot = createMockSnapshot({ snapshot_hash: "prod-hash" });
      const stagingSnapshot = createMockSnapshot({
        previous_hash: "prod-hash",
      });

      mockKvStorage.set("prod:snapshot:prod", prodSnapshot);
      mockKvStorage.set("staging:snapshot:staging", stagingSnapshot);

      await expect(promoteToProduction(mockEnv, "wrong-hash")).rejects.toThrow(
        "Hash chain broken",
      );
    });

    it("should handle empty production for first promotion", async () => {
      const stagingSnapshot = createMockSnapshot({ previous_hash: "" });
      mockKvStorage.set("staging:snapshot:staging", stagingSnapshot);

      // No production snapshot exists (returns null)
      const result = await promoteToProduction(mockEnv, "");

      expect(result).toBeDefined();
    });
  });

  describe("Revert production", () => {
    it("should revert to previous snapshot", async () => {
      const previousSnapshot = createMockSnapshot({
        snapshot_hash: "previous-hash",
      });

      await revertProduction(mockEnv, previousSnapshot);

      expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
        "snapshot:prod",
        expect.stringContaining("previous-hash"),
      );
    });
  });

  describe("Source registry CRUD", () => {
    it("should get source registry", async () => {
      const sources = [
        createMockSource(),
        createMockSource({ domain: "other.com" }),
      ];
      mockKvStorage.set("sources:registry", sources);

      const result = await getSourceRegistry(mockEnv);

      expect(result).toHaveLength(2);
      expect(result[0].domain).toBe("example.com");
    });

    it("should return empty array when registry not found", async () => {
      const result = await getSourceRegistry(mockEnv);

      expect(result).toEqual([]);
    });

    it("should update source registry", async () => {
      const sources = [createMockSource()];

      await updateSourceRegistry(mockEnv, sources);

      expect(mockEnv.DEALS_SOURCES.put).toHaveBeenCalledWith(
        "registry",
        expect.any(String),
      );
      expect(mockKvStorage.get("sources:registry")).toBeDefined();
    });

    it("should get specific source config", async () => {
      const sources = [
        createMockSource({ domain: "target.com" }),
        createMockSource({ domain: "other.com" }),
      ];
      mockKvStorage.set("sources:registry", sources);

      const result = await getSourceConfig(mockEnv, "target.com");

      expect(result).not.toBeNull();
      expect(result?.domain).toBe("target.com");
    });

    it("should return null for non-existent source", async () => {
      const result = await getSourceConfig(mockEnv, "nonexistent.com");

      expect(result).toBeNull();
    });

    it("should update source trust score", async () => {
      const sources = [
        createMockSource({ domain: "test.com", trust_initial: 0.5 }),
      ];
      mockKvStorage.set(
        "sources:registry",
        JSON.parse(JSON.stringify(sources)),
      ); // Deep clone

      await updateSourceTrust(mockEnv, "test.com", 0.2);

      // Get the updated registry from the mock put call
      const putCall = (mockEnv.DEALS_SOURCES.put as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updatedRegistry = JSON.parse(putCall[1]);
      expect(updatedRegistry[0].trust_initial).toBe(0.7);
    });

    it("should clamp trust score to valid range", async () => {
      const sources = [
        createMockSource({ domain: "test.com", trust_initial: 0.9 }),
      ];
      mockKvStorage.set(
        "sources:registry",
        JSON.parse(JSON.stringify(sources)),
      );

      await updateSourceTrust(mockEnv, "test.com", 0.2);

      const putCall = (mockEnv.DEALS_SOURCES.put as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updatedRegistry = JSON.parse(putCall[1]);
      expect(updatedRegistry[0].trust_initial).toBe(1.0); // Clamped to max
    });

    it("should record successful validation", async () => {
      const sources = [createMockSource({ domain: "test.com" })];
      mockKvStorage.set(
        "sources:registry",
        JSON.parse(JSON.stringify(sources)),
      );

      await recordSourceValidation(mockEnv, "test.com", true);

      const putCall = (mockEnv.DEALS_SOURCES.put as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updatedRegistry = JSON.parse(putCall[1]);
      expect(updatedRegistry[0].validation_success_count).toBe(1);
    });

    it("should record failed validation", async () => {
      const sources = [createMockSource({ domain: "test.com" })];
      mockKvStorage.set(
        "sources:registry",
        JSON.parse(JSON.stringify(sources)),
      );

      await recordSourceValidation(mockEnv, "test.com", false);

      const putCall = (mockEnv.DEALS_SOURCES.put as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updatedRegistry = JSON.parse(putCall[1]);
      expect(updatedRegistry[0].validation_failure_count).toBe(1);
    });

    it("should clamp trust score to valid range", async () => {
      const sources = [
        createMockSource({ domain: "test.com", trust_initial: 0.9 }),
      ];
      mockKvStorage.set(
        "sources:registry",
        JSON.parse(JSON.stringify(sources)),
      );

      await updateSourceTrust(mockEnv, "test.com", 0.2);

      const putCall = (mockEnv.DEALS_SOURCES.put as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updatedRegistry = JSON.parse(putCall[1]);
      expect(updatedRegistry[0].trust_initial).toBe(1.0); // Clamped to max
    });

    it("should record successful validation", async () => {
      const sources = [createMockSource({ domain: "test.com" })];
      mockKvStorage.set(
        "sources:registry",
        JSON.parse(JSON.stringify(sources)),
      );

      await recordSourceValidation(mockEnv, "test.com", true);

      const putCall = (mockEnv.DEALS_SOURCES.put as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updatedRegistry = JSON.parse(putCall[1]);
      expect(updatedRegistry[0].validation_success_count).toBe(1);
    });

    it("should record failed validation", async () => {
      const sources = [createMockSource({ domain: "test.com" })];
      mockKvStorage.set(
        "sources:registry",
        JSON.parse(JSON.stringify(sources)),
      );

      await recordSourceValidation(mockEnv, "test.com", false);

      const putCall = (mockEnv.DEALS_SOURCES.put as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      const updatedRegistry = JSON.parse(putCall[1]);
      expect(updatedRegistry[0].validation_failure_count).toBe(1);
    });
  });

  describe("Deal queries", () => {
    it("should get deal by ID", async () => {
      const snapshot = createMockSnapshot({
        deals: [createMockDeal("deal-1"), createMockDeal("deal-2")],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getDealById(mockEnv, "deal-1");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("deal-1");
    });

    it("should return null when deal not found", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getDealById(mockEnv, "nonexistent");

      expect(result).toBeNull();
    });

    it("should get deals by code (case insensitive)", async () => {
      const snapshot = createMockSnapshot({
        deals: [
          createMockDeal("1", { code: "ABC123" }),
          createMockDeal("2", { code: "abc123" }),
          createMockDeal("3", { code: "OTHER" }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getDealsByCode(mockEnv, "ABC123");

      expect(result).toHaveLength(2);
    });

    it("should return empty array when no deals match code", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getDealsByCode(mockEnv, "NOMATCH");

      expect(result).toEqual([]);
    });

    it("should get deals by category (case insensitive)", async () => {
      const snapshot = createMockSnapshot({
        deals: [
          createMockDeal("1", {
            metadata: {
              category: ["referral", "signup"],
              tags: ["test"],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
              status: "active",
            },
          }),
          createMockDeal("2", {
            metadata: {
              category: ["REFERRAL", "signup"],
              tags: ["test"],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
              status: "active",
            },
          }),
          createMockDeal("3", {
            metadata: {
              category: ["promo"],
              tags: ["test"],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
              status: "active",
            },
          }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getDealsByCategory(mockEnv, "referral");

      expect(result).toHaveLength(2);
    });

    it("should return empty array when no deals match category", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getDealsByCategory(mockEnv, "nonexistent");

      expect(result).toEqual([]);
    });

    it("should get active deals only", async () => {
      const snapshot = createMockSnapshot({
        deals: [
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
              status: "quarantined",
            },
          }),
          createMockDeal("3", {
            metadata: {
              category: ["test"],
              tags: ["test"],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
              status: "rejected",
            },
          }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getActiveDeals(mockEnv);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.status).toBe("active");
    });

    it("should get quarantined deals", async () => {
      const snapshot = createMockSnapshot({
        deals: [
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
              status: "quarantined",
            },
          }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const result = await getQuarantinedDeals(mockEnv);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.status).toBe("quarantined");
    });
  });

  describe("Run metadata", () => {
    it("should set last run metadata", async () => {
      const metadata = {
        run_id: "test-run",
        timestamp: "2024-03-31T00:00:00Z",
        duration_ms: 5000,
        deals_count: 10,
      };

      await setLastRunMetadata(mockEnv, metadata);

      expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
        "meta:last_run",
        expect.any(String),
      );
    });

    it("should get last run metadata", async () => {
      const metadata = {
        run_id: "last-run",
        timestamp: "2024-03-31T00:00:00Z",
        duration_ms: 3000,
        deals_count: 5,
      };
      mockKvStorage.set("prod:meta:last_run", metadata);

      const result = await getLastRunMetadata(mockEnv);

      expect(result).toEqual(metadata);
    });

    it("should return null when no last run metadata", async () => {
      const result = await getLastRunMetadata(mockEnv);

      expect(result).toBeNull();
    });
  });
});
