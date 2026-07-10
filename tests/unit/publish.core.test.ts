import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { publishSnapshot } from "../../worker/publish";
import {
  setGitHubToken,
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
  reward: overrides.reward ?? { type: "cash", value: 50, currency: "USD" },
  expiry: overrides.expiry ?? { confidence: 0.8, type: "soft" },
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
  stats: { total: 1, active: 1, quarantined: 0, rejected: 0, duplicates: 0 },
  deals: [createMockDeal("1")],
  ...overrides,
});

describe("publishSnapshot", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let mockContext: PipelineContext;

  beforeEach(() => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("console", { log: vi.fn(), error: vi.fn(), warn: vi.fn() });

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`prod:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string")
            return JSON.parse(value) as T;
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
          if (type === "json" && typeof value === "string")
            return JSON.parse(value) as T;
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
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      GITHUB_TOKEN: "test-token",
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;

    setGitHubToken("test-token");
    initGitHubCircuitBreaker(mockEnv as unknown as { DEALS_PROD: KVNamespace });

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

  it("should publish snapshot successfully", async () => {
    const snapshot = createMockSnapshot();
    mockKvStorage.set("staging:snapshot:staging", snapshot);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ commit: { sha: "new-sha" } }),
      })
      .mockResolvedValueOnce({
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

    expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
      "snapshot:prod",
      expect.any(String),
    );
    expect(mockEnv.DEALS_STAGING.put).toHaveBeenCalledWith(
      "meta:last_run",
      expect.any(String),
    );
  });

  it("should handle publish failure gracefully", async () => {
    const snapshot = createMockSnapshot();
    mockKvStorage.set("staging:snapshot:staging", snapshot);

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      publishSnapshot(mockEnv, snapshot, mockContext),
    ).rejects.toThrow();
  });

  it("should skip if snapshot already committed", async () => {
    const snapshot = createMockSnapshot({ snapshot_hash: "committed-hash" });
    mockKvStorage.set("staging:snapshot:staging", snapshot);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: "deals.json" }],
    });
    vi.stubGlobal("fetch", mockFetch);

    await publishSnapshot(mockEnv, snapshot, mockContext);

    expect(mockEnv.DEALS_PROD.put).not.toHaveBeenCalled();
  });

  it("should update last_run metadata after publish", async () => {
    const snapshot = createMockSnapshot();
    mockKvStorage.set("staging:snapshot:staging", snapshot);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ commit: { sha: "new-sha" } }),
      })
      .mockResolvedValueOnce({
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

    expect(mockEnv.DEALS_STAGING.put).toHaveBeenCalledWith(
      "meta:last_run",
      expect.any(String),
    );
  });
});
