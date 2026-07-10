import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDealById,
  getDealsByCode,
  getDealsByCategory,
  getActiveDeals,
  getQuarantinedDeals,
  setLastRunMetadata,
  getLastRunMetadata,
} from "../../worker/lib/storage";
import type { Deal, Snapshot, Env } from "../../worker/types";

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
  version: "0.1.0",
  generated_at: "2024-03-31T00:00:00Z",
  run_id: "test-run",
  trace_id: "test-trace",
  snapshot_hash: "abc123",
  previous_hash: "xyz789",
  schema_version: "0.1.0",
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

describe("Storage Layer - Deal Queries & Metadata", () => {
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
      expect(result[0]!.metadata.status).toBe("active");
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
      expect(result[0]!.metadata.status).toBe("quarantined");
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
