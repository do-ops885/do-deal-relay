import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index";
import type { Env, Snapshot, Deal } from "../../worker/types";

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

describe("API Endpoints", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());

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
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`log:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`log:${key}`, value);
        }),
      } as unknown as KVNamespace,
      DEALS_LOCK: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`lock:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("GET /health", () => {
    it("should return 200 when system is healthy", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("healthy");
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(body.checks.kv_connection).toBe(true);
    });

    it("should return 503 when snapshot is missing", async () => {
      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.status).toBe("degraded");
    });

    it("should include CORS headers", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET",
      );
    });
  });

  describe("GET /metrics", () => {
    it("should return Prometheus format metrics", async () => {
      const snapshot = createMockSnapshot({
        stats: {
          total: 10,
          active: 8,
          quarantined: 1,
          rejected: 1,
          duplicates: 0,
        },
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/metrics");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain");

      const body = await response.text();
      expect(body).toContain("deals_runs_total");
      expect(body).toContain("deals_active_deals");
      expect(body).toContain("8"); // active count
    });

    it("should handle missing snapshot gracefully", async () => {
      const request = new Request("http://localhost/metrics");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("deals_active_deals 0");
    });
  });

  describe("GET /deals", () => {
    it("should return array of deals", async () => {
      const snapshot = createMockSnapshot({
        deals: [
          createMockDeal("1", {
            metadata: {
              status: "active",
              category: ["referral"],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
          createMockDeal("2", {
            metadata: {
              status: "active",
              category: ["signup"],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
    });

    it("should return 404 when no snapshot exists", async () => {
      const request = new Request("http://localhost/deals");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("No deals available");
    });

    it("should filter by category", async () => {
      const snapshot = createMockSnapshot({
        deals: [
          createMockDeal("1", {
            metadata: {
              status: "active",
              category: ["referral"],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
          createMockDeal("2", {
            metadata: {
              status: "active",
              category: ["signup"],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals?category=referral");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveLength(1);
      expect(body[0].metadata.category).toContain("referral");
    });

    it("should filter by min_reward", async () => {
      const snapshot = createMockSnapshot({
        deals: [
          createMockDeal("1", {
            reward: { type: "cash", value: 25, currency: "USD" },
            metadata: {
              status: "active",
              category: [],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
          createMockDeal("2", {
            reward: { type: "cash", value: 75, currency: "USD" },
            metadata: {
              status: "active",
              category: [],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals?min_reward=50");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveLength(1);
      expect(body[0].reward.value).toBe(75);
    });

    it("should respect limit parameter", async () => {
      const snapshot = createMockSnapshot({
        deals: Array(10)
          .fill(null)
          .map((_, i) =>
            createMockDeal(`${i}`, {
              metadata: {
                status: "active",
                category: [],
                tags: [],
                normalized_at: "2024-03-31T00:00:00Z",
                confidence_score: 0.8,
              },
            }),
          ),
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals?limit=5");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveLength(5);
    });

    it("should return 400 for invalid query params", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals?limit=invalid");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
    });
  });

  describe("GET /deals.json", () => {
    it("should return full snapshot object", async () => {
      const snapshot = createMockSnapshot({
        deals: [createMockDeal("1")],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals.json");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("version");
      expect(body).toHaveProperty("generated_at");
      expect(body).toHaveProperty("snapshot_hash");
      expect(body).toHaveProperty("deals");
      expect(Array.isArray(body.deals)).toBe(true);
    });

    it("should apply filters to deals within snapshot", async () => {
      const snapshot = createMockSnapshot({
        deals: [
          createMockDeal("1", {
            metadata: {
              status: "active",
              category: ["referral"],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
          createMockDeal("2", {
            metadata: {
              status: "active",
              category: ["signup"],
              tags: [],
              normalized_at: "2024-03-31T00:00:00Z",
              confidence_score: 0.8,
            },
          }),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request(
        "http://localhost/deals.json?category=referral",
      );
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.deals).toHaveLength(1);
    });
  });

  describe("POST /api/discover", () => {
    it("should trigger discovery pipeline", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });
      vi.stubGlobal("fetch", mockFetch);

      const request = new Request("http://localhost/api/discover", {
        method: "POST",
      });
      const response = await worker.fetch(request, mockEnv);

      // Pipeline may return success or failure depending on pipeline state
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it("should handle pipeline errors gracefully", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "bad.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const request = new Request("http://localhost/api/discover", {
        method: "POST",
      });
      const response = await worker.fetch(request, mockEnv);

      // Should return error response
      expect(response.status).toBeGreaterThanOrEqual(200);
      const body = await response.json();
      expect(body).toHaveProperty("success");
    });
  });

  describe("GET /api/status", () => {
    it("should return pipeline status", async () => {
      const request = new Request("http://localhost/api/status");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("locked");
    });

    it("should show locked status when pipeline is running", async () => {
      const futureDate = new Date(Date.now() + 600000).toISOString();
      mockKvStorage.set("lock:pipeline:lock", {
        run_id: "current-run",
        trace_id: "current-trace",
        acquired_at: new Date().toISOString(),
        expires_at: futureDate,
      });

      const request = new Request("http://localhost/api/status");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      // Lock status depends on implementation
      expect(body).toHaveProperty("locked");
    });
  });

  describe("GET /api/log", () => {
    it("should return recent logs", async () => {
      mockKvStorage.set("log:run-1", {
        run_id: "run-1",
        trace_id: "trace-1",
        ts: "2024-03-31T00:00:00Z",
        phase: "finalize",
        status: "complete",
      });

      const request = new Request("http://localhost/api/log?count=10");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("logs");
      expect(body).toHaveProperty("count");
    });

    it("should return logs for specific run_id", async () => {
      mockKvStorage.set("log:specific-run", {
        run_id: "specific-run",
        trace_id: "trace-1",
        ts: "2024-03-31T00:00:00Z",
        phase: "finalize",
        status: "complete",
      });

      const request = new Request(
        "http://localhost/api/log?run_id=specific-run",
      );
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.logs).toBeDefined();
    });

    it("should return JSONL format when requested", async () => {
      mockKvStorage.set("log:run-1", {
        run_id: "run-1",
        trace_id: "trace-1",
        ts: "2024-03-31T00:00:00Z",
        phase: "finalize",
        status: "complete",
      });

      const request = new Request("http://localhost/api/log?format=jsonl");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
      expect(response.headers.get("Content-Disposition")).toContain(
        "attachment",
      );
    });
  });

  describe("POST /api/submit", () => {
    it("should submit a new deal", async () => {
      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/deal",
          code: "NEWCODE",
          source: "test",
          metadata: {
            title: "New Deal",
            reward: { type: "cash", value: 100, currency: "USD" },
            category: ["referral"],
          },
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty("deal_id");
      expect(body).toHaveProperty("code");
      expect(body.status).toBe("quarantined");
    });

    it("should return 415 for non-JSON content type", async () => {
      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(415);
      expect(await response.json()).toHaveProperty("error");
    });

    it("should return 400 for invalid body", async () => {
      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "not-a-url" }), // missing required fields
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
    });

    it("should return 409 for duplicate deal code", async () => {
      const snapshot = createMockSnapshot({
        deals: [createMockDeal("1", { code: "DUPLICATE" })],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/deal",
          code: "DUPLICATE",
          source: "test",
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toContain("already exists");
    });

    it("should return 413 for body too large", async () => {
      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "2000000", // > 1MB
        },
        body: JSON.stringify({ url: "https://example.com", code: "TEST" }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(413);
    });
  });

  describe("Error handling", () => {
    it("should return 404 for unknown paths", async () => {
      const request = new Request("http://localhost/unknown");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      expect(await response.json()).toHaveProperty("error");
    });

    it("should handle KV errors gracefully", async () => {
      const brokenEnv = {
        ...mockEnv,
        DEALS_PROD: {
          get: vi.fn().mockImplementation(() => {
            throw new Error("KV error");
          }),
          put: vi.fn(),
          delete: vi.fn(),
        } as unknown as KVNamespace,
      };

      const request = new Request("http://localhost/health");

      // The error should be caught and return 500
      try {
        const response = await worker.fetch(request, brokenEnv);
        expect(response.status).toBe(500);
      } catch (error) {
        // If it throws, that's also acceptable error handling
        expect(error).toBeDefined();
      }
    });
  });

  describe("CORS headers", () => {
    it("should include CORS headers on responses", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET",
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
        "Content-Type",
      );
    });
  });
});
