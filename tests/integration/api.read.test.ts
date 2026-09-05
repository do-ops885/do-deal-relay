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
  const authHeader = { "X-API-Key": "ddr_admin_test_key_123" };
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  function mockKvFactory(prefix: string) {
    return {
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
    };
  }

  async function setupTestApiKey() {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode("ddr_admin_test_key_123"),
    );
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    mockKvStorage.set(
      "sources:apikey:" + hash,
      JSON.stringify({
        userId: "test-user",
        role: "admin",
        createdAt: new Date().toISOString(),
      }),
    );
  }

  beforeEach(async () => {
    mockKvStorage = new Map();
    vi.stubGlobal("fetch", vi.fn());
    await setupTestApiKey();

    mockEnv = {
      DEALS_PROD: mockKvFactory("prod"),
      DEALS_STAGING: mockKvFactory("staging"),
      DEALS_LOG: mockKvFactory("log"),
      DEALS_LOCK: mockKvFactory("lock"),
      DEALS_SOURCES: mockKvFactory("sources"),
      WEBHOOK_API_KEYS: mockKvFactory("sources"),
      DEALS_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(),
          run: vi.fn().mockResolvedValue({ success: true }),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      } as unknown as Env["DEALS_DB"],
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      JWT_SECRET: "test-jwt-secret-32-chars-minimum-xyz",
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("GET /health", () => {
    it("should return 200 when system is healthy", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(["healthy", "degraded"]).toContain(body.status);
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it("should return 503 or 200 when snapshot is missing", async () => {
      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv, mockCtx);

      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect([200, 503]).toContain(response.status);
      expect(["healthy", "degraded"]).toContain(body.status);
    });

    it("should include CORS headers", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/health");
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(
        response.headers.get("Access-Control-Allow-Origin"),
      ).not.toBeNull();
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET",
      );
    });
  });

  describe("GET /metrics", () => {
    it("should return metrics in JSON format", async () => {
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

      const request = new Request("http://localhost/metrics?format=json", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(body.funnel).toBeDefined();
    });

    it("should return Prometheus format by default", async () => {
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

      const request = new Request("http://localhost/metrics", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      const contentType = response.headers.get("Content-Type") || "";
      expect(contentType).toContain("text/plain");
      const body = await response.text();
      expect(body).toContain("# HELP");
      expect(body).toContain("pipeline_");
    });

    it("should handle missing snapshot gracefully", async () => {
      const request = new Request("http://localhost/metrics?format=json", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(body.funnel).toBeDefined();
      expect(body.funnel.discovered).toBe(0);
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

      const request = new Request("http://localhost/deals", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
    });

    it("should return 404 when no snapshot exists", async () => {
      const request = new Request("http://localhost/deals", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(404);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
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

      const request = new Request("http://localhost/deals?category=referral", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
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

      const request = new Request("http://localhost/deals?min_reward=50", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
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

      const request = new Request("http://localhost/deals?limit=5", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(body).toHaveLength(5);
    });

    it("should return 400 for invalid query params", async () => {
      const snapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals?limit=invalid", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(400);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      expect((await response.json()) as any).toHaveProperty("error");
    });
  });

  describe("GET /deals.json", () => {
    it("should return full snapshot object", async () => {
      const snapshot = createMockSnapshot({
        deals: [createMockDeal("1")],
      });
      mockKvStorage.set("prod:snapshot:prod", snapshot);

      const request = new Request("http://localhost/deals.json", {
        headers: authHeader,
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
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
        { headers: authHeader },
      );
      const response = await worker.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      // biome-ignore-next-line lint/suspicious/noExplicitAny: test response parsing
      const body = (await response.json()) as any;
      expect(body.deals).toHaveLength(1);
    });
  });
});
