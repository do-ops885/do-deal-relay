import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index";
import type { Env, Deal } from "../../worker/types";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";

// Hardcoded test key for the mock
const TEST_KEY = "ddr_test_key_123456789";

// Mock auth module
vi.mock("../../worker/lib/auth", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    authenticateRequest: vi.fn(async (request: Request) => {
      const key =
        request.headers.get("X-API-Key") ||
        request.headers.get("Authorization")?.replace("Bearer ", "");
      if (key === "ddr_test_key_123456789") {
        return { authenticated: true, userId: "test-user", role: "admin" };
      }
      return { authenticated: false, error: "Invalid API key" };
    }),
    createAuthMiddleware: vi.fn((_env, requiredRole) => {
      return async (
        request: Request,
        handler: (auth: any) => Promise<Response>,
      ) => {
        const key =
          request.headers.get("X-API-Key") ||
          request.headers.get("Authorization")?.replace("Bearer ", "");
        if (key === "ddr_test_key_123456789") {
          const auth = {
            authenticated: true,
            userId: "test-user",
            role: "admin",
          };
          return handler(auth);
        }
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      };
    }),
  };
});

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

const createMockEnv = (overrides: Partial<Env> = {}): Env => {
  const mockKvStorage = new Map<string, unknown>();

  const baseEnv: Env = {
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
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    ...overrides,
  };

  return baseEnv;
};

describe("Experience API Endpoints", () => {
  let mockEnv: Env;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockEnv = createMockEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("POST /api/experience", () => {
    it("should return 503 when D1 is not configured", async () => {
      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          deal_code: "DEAL123",
          event_type: "click",
        }),
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("D1 database not configured");
    });

    it("should return 415 for non-JSON content type", async () => {
      const envWithDb = createMockEnv({
        DEALS_DB: {
          prepare: vi.fn(),
          batch: vi.fn(),
          exec: vi.fn(),
          withSession: vi.fn(),
        } as unknown as D1Database,
      });

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-API-Key": TEST_KEY,
        },
        body: "not json",
      });

      const response = await worker.fetch(request, envWithDb);

      expect(response.status).toBe(415);
    });

    it("should return 400 for missing required fields", async () => {
      const envWithDb = createMockEnv({
        DEALS_DB: {
          prepare: vi.fn(),
          batch: vi.fn(),
          exec: vi.fn(),
          withSession: vi.fn(),
        } as unknown as D1Database,
      });

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({ deal_code: "DEAL123" }),
      });

      const response = await worker.fetch(request, envWithDb);

      expect(response.status).toBe(400);
    });

    it("should return 400 for invalid event_type", async () => {
      const envWithDb = createMockEnv({
        DEALS_DB: {
          prepare: vi.fn(),
          batch: vi.fn(),
          exec: vi.fn(),
          withSession: vi.fn(),
        } as unknown as D1Database,
      });

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          deal_code: "DEAL123",
          event_type: "invalid_type",
        }),
      });

      const response = await worker.fetch(request, envWithDb);

      expect(response.status).toBe(400);
    });

    it("should return 400 for invalid score", async () => {
      const envWithDb = createMockEnv({
        DEALS_DB: {
          prepare: vi.fn(),
          batch: vi.fn(),
          exec: vi.fn(),
          withSession: vi.fn(),
        } as unknown as D1Database,
      });

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_KEY,
        },
        body: JSON.stringify({
          deal_code: "DEAL123",
          event_type: "click",
          score: 150,
        }),
      });

      const response = await worker.fetch(request, envWithDb);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/experience/:deal_code", () => {
    it("should return 503 when D1 is not configured", async () => {
      const request = new Request("http://localhost/api/experience/DEAL123", {
        headers: {
          "X-API-Key": TEST_KEY,
        },
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(503);
    });

    it("should return empty aggregate when no data exists", async () => {
      const mockStatement = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ results: [], meta: {} }),
      };

      const envWithDb = createMockEnv({
        DEALS_DB: {
          prepare: vi.fn().mockReturnValue(mockStatement),
          batch: vi.fn(),
          exec: vi.fn(),
          withSession: vi.fn().mockReturnValue({
            prepare: vi.fn().mockReturnValue(mockStatement),
            getBookmark: vi.fn().mockReturnValue("test"),
          }),
        } as unknown as D1Database,
      });

      const request = new Request("http://localhost/api/experience/DEAL123", {
        headers: {
          "X-API-Key": TEST_KEY,
        },
      });

      const response = await worker.fetch(request, envWithDb);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.total_events).toBe(0);
    });
  });

  describe("POST /api/experience/aggregate", () => {
    it("should return 503 when D1 is not configured", async () => {
      const request = new Request("http://localhost/api/experience/aggregate", {
        method: "POST",
        headers: {
          "X-API-Key": TEST_KEY,
        },
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(503);
    });
  });
});
