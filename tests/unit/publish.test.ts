import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { publishSnapshot, rollbackSnapshot } from "../../worker/publish";
import {
  setGitHubToken,
  resetGitHubToken,
  initGitHubCircuitBreaker,
} from "../../worker/lib/github/index";
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

describe("Publish Module", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let mockContext: PipelineContext;

  beforeEach(() => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());
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

    // Initialize GitHub token for tests
    setGitHubToken("test-token");
    initGitHubCircuitBreaker(mockEnv);

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
  });

  describe("publishSnapshot", () => {
    it("should publish snapshot successfully", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          // isSnapshotCommitted
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          // getFileContent (not found)
          status: 404,
          ok: false,
        })
        .mockResolvedValueOnce({
          // commitFile
          ok: true,
          json: async () => ({ commit: { sha: "commit-sha-123" } }),
        })
        .mockResolvedValueOnce({
          // verifyCommit - getRecentCommits returns raw GitHub API format
          ok: true,
          json: async () => [
            {
              sha: "commit-sha-123",
              commit: {
                message: "[AUTO] Update deals",
                author: {
                  name: "Test",
                  email: "test@example.com",
                  date: "2024-03-31T00:00:00Z",
                },
              },
            },
          ],
        });
      vi.stubGlobal("fetch", mockFetch);

      const result = await publishSnapshot(mockEnv, snapshot, mockContext);

      expect(result.success).toBe(true);
      expect(result.commitSha).toBeDefined();
    });

    it("should verify GITHUB_TOKEN is configured", async () => {
      const envWithoutToken = { ...mockEnv, GITHUB_TOKEN: undefined };
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      // Reset the GitHub token to simulate unconfigured state
      resetGitHubToken();

      await expect(
        publishSnapshot(envWithoutToken, snapshot, mockContext),
      ).rejects.toThrow("GITHUB_TOKEN not configured");

      // Restore the token for other tests
      setGitHubToken("test-token");
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

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            sha: "abc123",
            commit: {
              message: `[AUTO] Update deals - ${snapshot.snapshot_hash}`,
            },
          },
        ],
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await publishSnapshot(mockEnv, snapshot, mockContext);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only isSnapshotCommitted call
    });

    it("should handle GitHub commit failure", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          // isSnapshotCommitted
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          // commitSnapshot fails
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        publishSnapshot(mockEnv, snapshot, mockContext),
      ).rejects.toThrow();
    });

    it("should verify GitHub commit SHA", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          // isSnapshotCommitted
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          // getFileContent (not found)
          status: 404,
          ok: false,
        })
        .mockResolvedValueOnce({
          // commitFile
          ok: true,
          json: async () => ({ commit: { sha: "commit-sha-123" } }),
        })
        .mockResolvedValueOnce({
          // verifyCommit - different SHA to trigger failure (raw GitHub API format)
          ok: true,
          json: async () => [
            {
              sha: "different-sha",
              commit: {
                message: "[AUTO] Update deals",
                author: {
                  name: "Test",
                  email: "test@example.com",
                  date: "2024-03-31T00:00:00Z",
                },
              },
            },
          ],
        });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        publishSnapshot(mockEnv, snapshot, mockContext),
      ).rejects.toThrow("GitHub commit verification failed");
    });

    it("should update last run metadata after publish", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          // isSnapshotCommitted
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          // getFileContent (not found)
          status: 404,
          ok: false,
        })
        .mockResolvedValueOnce({
          // commitFile
          ok: true,
          json: async () => ({ commit: { sha: "commit-sha-123" } }),
        })
        .mockResolvedValueOnce({
          // verifyCommit - getRecentCommits returns raw GitHub API format
          ok: true,
          json: async () => [
            {
              sha: "commit-sha-123",
              commit: {
                message: "[AUTO] Update deals",
                author: {
                  name: "Test",
                  email: "test@example.com",
                  date: "2024-03-31T00:00:00Z",
                },
              },
            },
          ],
        });
      vi.stubGlobal("fetch", mockFetch);

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
        "KV write failed",
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

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          // isSnapshotCommitted
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          // getFileContent (not found)
          status: 404,
          ok: false,
        })
        .mockResolvedValueOnce({
          // commitFile
          ok: true,
          json: async () => ({ commit: { sha: "new-sha" } }),
        })
        .mockResolvedValueOnce({
          // verifyCommit - getRecentCommits returns raw GitHub API format
          ok: true,
          json: async () => [
            {
              sha: "new-sha",
              commit: {
                message: "[AUTO] Update deals",
                author: {
                  name: "Test",
                  email: "test@example.com",
                  date: "2024-03-31T00:00:00Z",
                },
              },
            },
          ],
        });
      vi.stubGlobal("fetch", mockFetch);

      await publishSnapshot(mockEnv, snapshot, mockContext);

      // Verify the commit was made with correct data
      const commitCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[1] as { method?: string })?.method === "PUT",
      );
      expect(commitCall).toBeDefined();
    });

    it("should use correct file path from config", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("staging:snapshot:staging", snapshot);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          // isSnapshotCommitted
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          // getFileContent
          status: 404,
          ok: false,
        })
        .mockResolvedValueOnce({
          // commitFile
          ok: true,
          json: async () => ({ commit: { sha: "sha" } }),
        })
        .mockResolvedValueOnce({
          // verifyCommit - getRecentCommits returns raw GitHub API format
          ok: true,
          json: async () => [
            {
              sha: "sha",
              commit: {
                message: "[AUTO] Update deals",
                author: {
                  name: "Test",
                  email: "test@example.com",
                  date: "2024-03-31T00:00:00Z",
                },
              },
            },
          ],
        });
      vi.stubGlobal("fetch", mockFetch);

      await publishSnapshot(mockEnv, snapshot, mockContext);

      // Should use deals.json path
      const commitCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[1] as { method?: string })?.method === "PUT",
      );
      expect((commitCall as unknown[])[0]).toContain("deals.json");
    });
  });
});
