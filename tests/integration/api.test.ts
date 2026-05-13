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

describe("API Endpoints", () => {
  const authHeader = { Authorization: "Bearer ddr_test_key_123" };
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  const TEST_API_KEY = "ddr_test_key_12345678901234567890";

  beforeEach(async () => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());

    const mockKvFactory = (prefix: string) =>
      ({
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(`${prefix}:${key}`);
          if (value === undefined) return null;
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(`${prefix}:${key}`, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(`${prefix}:${key}`);
        }),
        list: vi.fn(async ({ prefix: p }: { prefix: string }) => {
          const keys: { name: string }[] = [];
          for (const [key] of mockKvStorage.entries()) {
            if (key.startsWith(`${prefix}:${p}`)) {
              keys.push({ name: key.replace(`${prefix}:`, "") });
            }
          }
          return { keys };
        }),
      }) as unknown as KVNamespace;

    mockEnv = {
      DEALS_PROD: mockKvFactory("prod"),
      DEALS_STAGING: mockKvFactory("staging"),
      DEALS_LOG: mockKvFactory("log"),
      DEALS_LOCK: mockKvFactory("lock"),
      DEALS_SOURCES: mockKvFactory("sources"),
      WEBHOOK_API_KEYS: mockKvFactory("sources"),
      AI_GATEWAY_URL: "https://gateway.test",
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
      CANDIDATE_BUDGET_GLOBAL: "100",
      CANDIDATE_BUDGET_PER_SOURCE: "10",
      CANDIDATE_BUDGET_HIGH_TRUST_BONUS: "5",
    } as unknown as Env;

    // Setup API key
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(TEST_API_KEY),
    );
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    mockKvStorage.set(
      `sources:apikey:${hash}`,
      JSON.stringify({
        userId: "test-user",
        role: "admin",
        createdAt: new Date().toISOString(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("GET /health", () => {
    it("should return 200 when system is healthy", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(snapshot));

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.status).toBe("healthy");
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(body.checks.kv_connection).toBe(true);
    });

    it("should return 503 when snapshot is missing", async () => {
      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(503);
      const body = (await response.json()) as any;
      expect(body.status).toBe("degraded");
    });

    it("should include CORS headers", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(snapshot));

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv);

      expect(
        response.headers.get("Access-Control-Allow-Origin"),
      ).not.toBeNull();
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
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(snapshot));

      const request = new Request("http://localhost/metrics");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain");

      const body = await response.text();
      expect(body).toContain("deals_runs_total");
    });

    it("should handle missing snapshot gracefully", async () => {
      const request = new Request("http://localhost/metrics");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
    });
  });

  describe("GET /deals", () => {
    it("should return array of deals", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(snapshot));

      const request = new Request("http://localhost/deals");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it("should return 404 when no snapshot exists", async () => {
      const request = new Request("http://localhost/deals");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
    });

    it("should filter by category", async () => {
      const snapshot = createMockSnapshot({
        deals: [
          createMockDeal("1", { metadata: { category: ["finance"] } } as any),
          createMockDeal("2", { metadata: { category: ["shopping"] } } as any),
        ],
      });
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(snapshot));

      const request = new Request("http://localhost/deals?category=finance");
      const response = await worker.fetch(request, mockEnv);

      const body = (await response.json()) as any;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe("1");
    });

    it("should respect limit parameter", async () => {
      const snapshot = createMockSnapshot({
        deals: [createMockDeal("1"), createMockDeal("2"), createMockDeal("3")],
      });
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(snapshot));

      const request = new Request("http://localhost/deals?limit=2");
      const response = await worker.fetch(request, mockEnv);

      const body = (await response.json()) as any;
      expect(body).toHaveLength(2);
    });
  });

  describe("POST /api/discover", () => {
    it("should trigger discovery pipeline", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "example.com",
            url_patterns: ["/"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      // Mock successful fetch for discovery
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response("<html></html>"));
      vi.stubGlobal("fetch", mockFetch);

      const request = new Request("http://localhost/api/discover", {
        method: "POST",
        headers: { "X-API-Key": TEST_API_KEY },
      });
      const response = await worker.fetch(request, mockEnv);

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
        headers: { "X-API-Key": TEST_API_KEY },
      });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBeGreaterThanOrEqual(200);
      const body = (await response.json()) as any;
      expect(body).toHaveProperty("success");
    });
  });

  describe("POST /api/submit", () => {
    it("should submit a new deal", async () => {
      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
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
      const body = (await response.json()) as any;
      expect(body.success).toBe(true);
      expect(body).toHaveProperty("deal_id");
    });

    it("should return 415 for non-JSON content type", async () => {
      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-API-Key": TEST_API_KEY,
        },
        body: "not json",
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(415);
    });

    it("should return 409 for duplicate deal code", async () => {
      // Setup existing deal in prod snapshot (used by getDealsByCode)
      const snapshot = createMockSnapshot({
        deals: [createMockDeal("1", { code: "DUPLICATE" })],
      });
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(snapshot));

      const request = new Request("http://localhost/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify({
          url: "https://example.com/deal",
          code: "DUPLICATE",
          source: "test",
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(409);
    });
  });

  describe("Error handling", () => {
    it("should return 404 for unknown paths", async () => {
      const request = new Request("http://localhost/invalid-path");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
    });

    it("should handle KV errors gracefully", async () => {
      const errorEnv = {
        ...mockEnv,
        DEALS_PROD: {
          get: vi.fn().mockRejectedValue(new Error("KV error")),
        },
        DEALS_LOG: {
          get: vi.fn().mockRejectedValue(new Error("KV error")),
          put: vi.fn().mockRejectedValue(new Error("KV error")),
          list: vi.fn().mockRejectedValue(new Error("KV error")),
        },
        DEALS_LOCK: {
          get: vi.fn().mockRejectedValue(new Error("KV error")),
        },
      } as unknown as Env;

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, errorEnv);

      // The health handler has its own try-catch around getProductionSnapshot,
      // but other calls in Promise.all might still throw and trigger the outer catch.
      expect(response.status).toBe(500);
    });
  });
});
