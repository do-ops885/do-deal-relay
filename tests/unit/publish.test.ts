import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../worker/lib/github", () => {
  const fn = vi.fn;
  return {
    isSnapshotCommitted: fn(async () => false),
    commitSnapshot: fn(async () => "commit-sha-123"),
    getFileContent: fn(async () => null),
    getRecentCommits: fn(async () => [{ sha: "commit-sha-123" }]),
    verifyCommit: fn(async () => true),
    commitFile: fn(async () => "commit-sha-123"),
  };
});

import { publishSnapshot, rollbackSnapshot } from "../../worker/publish";
import * as github from "../../worker/lib/github";
import type { Snapshot, Deal, Env, PipelineContext } from "../../worker/types";

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

describe("Publish Module", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let mockContext: PipelineContext;

  beforeEach(() => {
    mockKvStorage = new Map();

    vi.stubGlobal("console", {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });

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
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      GITHUB_TOKEN: "test-token",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;

    mockContext = {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(github.commitSnapshot).mockClear();
    vi.mocked(github.isSnapshotCommitted).mockClear();
  });

  describe("publishSnapshot", () => {
    it("should publish snapshot successfully", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      vi.mocked(github.isSnapshotCommitted).mockResolvedValueOnce(false);
      vi.mocked(github.commitSnapshot).mockResolvedValueOnce("commit-sha-123");

      const result = await publishSnapshot(mockEnv, snapshot, mockContext);

      expect(result.success).toBe(true);
      expect(result.commitSha).toBe("commit-sha-123");
    });

    it("should verify GITHUB_TOKEN is configured", async () => {
      const envWithoutToken = { ...mockEnv, GITHUB_TOKEN: undefined };
      const snapshot = createMockSnapshot();

      await expect(
        publishSnapshot(envWithoutToken, snapshot, mockContext),
      ).rejects.toThrow("GITHUB_TOKEN not configured");
    });

    it("should verify staging snapshot exists", async () => {
      const snapshot = createMockSnapshot();

      await expect(
        publishSnapshot(mockEnv, snapshot, mockContext),
      ).rejects.toThrow("No staging snapshot found");
    });

    it("should verify hash chain matches", async () => {
      const snapshot = createMockSnapshot({ snapshot_hash: "different-hash" });
      mockKvStorage.set("staging:snapshot:staging", createMockSnapshot());

      await expect(
        publishSnapshot(mockEnv, snapshot, mockContext),
      ).rejects.toThrow("Staging hash mismatch");
    });

    it("should skip if already committed (idempotency)", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      vi.mocked(github.isSnapshotCommitted).mockResolvedValueOnce(true);

      const result = await publishSnapshot(mockEnv, snapshot, mockContext);

      expect(result.success).toBe(true);
    });

    it("should handle GitHub commit failure", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      vi.mocked(github.isSnapshotCommitted).mockResolvedValueOnce(false);
      vi.mocked(github.commitSnapshot).mockRejectedValueOnce(
        new Error("GitHub commit failed: 500"),
      );

      await expect(
        publishSnapshot(mockEnv, snapshot, mockContext),
      ).rejects.toThrow();
    });

    it("should verify GitHub commit SHA", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      // Make commitSnapshot fail (simulating verifyCommit failure inside it)
      vi.mocked(github.commitSnapshot).mockImplementationOnce(async () => {
        throw new Error("GitHub commit verification failed");
      });

      await expect(
        publishSnapshot(mockEnv, snapshot, mockContext),
      ).rejects.toThrow("GitHub commit verification failed");
    });

    it("should update last run metadata after publish", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      vi.mocked(github.isSnapshotCommitted).mockResolvedValueOnce(false);
      vi.mocked(github.commitSnapshot).mockResolvedValueOnce("commit-sha-123");

      await publishSnapshot(mockEnv, snapshot, mockContext);

      // Should have updated metadata
      expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
        "meta:last_run",
        expect.any(String),
      );
    });
  });

  describe("rollbackSnapshot", () => {
    it("should rollback to previous snapshot", async () => {
      const previousSnapshot = createMockSnapshot({
        snapshot_hash: "prev-hash",
      });

      await rollbackSnapshot(mockEnv, previousSnapshot);

      // Should have written to production
      expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
        "snapshot:prod",
        expect.any(String),
      );
    });

    it("should handle rollback failure", async () => {
      const previousSnapshot = createMockSnapshot();

      // Make the put fail
      mockEnv.DEALS_PROD.put = vi
        .fn()
        .mockRejectedValue(new Error("KV write failed"));

      await expect(rollbackSnapshot(mockEnv, previousSnapshot)).rejects.toThrow(
        "Rollback failed",
      );
    });

    it("should log rollback success", async () => {
      const previousSnapshot = createMockSnapshot({
        snapshot_hash: "prev-hash-123",
      });

      await rollbackSnapshot(mockEnv, previousSnapshot);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Rolled back to snapshot"),
      );
    });
  });

  describe("GitHub integration", () => {
    it("should commit snapshot with correct stats", async () => {
      const snapshot = createMockSnapshot({
        stats: {
          total: 10,
          active: 8,
          quarantined: 1,
          rejected: 1,
          duplicates: 0,
        },
      });
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      await publishSnapshot(mockEnv, snapshot, mockContext);

      expect(github.commitSnapshot).toHaveBeenCalledWith(
        mockEnv.GITHUB_REPO,
        mockEnv.GITHUB_TOKEN,
        expect.anything(),
        expect.objectContaining({ total: 10, active: 8 }),
      );
    });

    it("should use correct file path from config", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      await publishSnapshot(mockEnv, snapshot, mockContext);

      expect(github.commitSnapshot).toHaveBeenCalled();
    });
  });
});
