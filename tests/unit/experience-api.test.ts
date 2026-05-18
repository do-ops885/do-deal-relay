import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index";
import type { Env, Deal } from "../../worker/types";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";

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
    AI_GATEWAY_URL: "https://gateway.test",
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    ...overrides,
  };

  return baseEnv;
};

describe("Experience API Endpoints", () => {
  const authHeader = { "X-API-Key": "ddr_user_test_key_123" };
  const adminAuthHeader = { "X-API-Key": "ddr_admin_test_key_123" };
  let mockEnv: Env;

  async function setupTestApiKeys(env: Env) {
    const encoder = new TextEncoder();

    // User Key
    const userHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode("ddr_user_test_key_123"),
    );
    const userHash = Array.from(new Uint8Array(userHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Admin Key
    const adminHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode("ddr_admin_test_key_123"),
    );
    const adminHash = Array.from(new Uint8Array(adminHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const mockGet = vi.fn().mockImplementation(async (key: string) => {
      if (key === `apikey:${userHash}`) {
        return {
          userId: "test-user",
          role: "user",
          createdAt: new Date().toISOString(),
        };
      }
      if (key === `apikey:${adminHash}`) {
        return {
          userId: "test-admin",
          role: "admin",
          createdAt: new Date().toISOString(),
        };
      }
      return null;
    });

    const mockPut = vi.fn().mockResolvedValue(undefined);

    (env.DEALS_SOURCES.get as any) = mockGet;
    (env.DEALS_SOURCES.put as any) = mockPut;

    if (env.WEBHOOK_API_KEYS) {
        (env.WEBHOOK_API_KEYS.get as any) = mockGet;
        (env.WEBHOOK_API_KEYS.put as any) = mockPut;
    } else {
        env.WEBHOOK_API_KEYS = {
            get: mockGet,
            put: mockPut
        } as any;
    }
  }

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    mockEnv = createMockEnv();
    await setupTestApiKeys(mockEnv);
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
          ...authHeader
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
      await setupTestApiKeys(envWithDb);

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          ...authHeader
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
      await setupTestApiKeys(envWithDb);

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader
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
      await setupTestApiKeys(envWithDb);

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader
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
      await setupTestApiKeys(envWithDb);

      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader
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
        headers: authHeader
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
      await setupTestApiKeys(envWithDb);

      const request = new Request("http://localhost/api/experience/DEAL123", {
        headers: authHeader
      });

      const response = await worker.fetch(request, envWithDb);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.total_events).toBe(0);
    });
  });

  describe("POST /api/experience/aggregate", () => {
    it("should return 401 when API key is missing", async () => {
      const request = new Request("http://localhost/api/experience/aggregate", {
        method: "POST",
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(401);
    });

    it("should return 503 when D1 is not configured and authenticated", async () => {
      const request = new Request("http://localhost/api/experience/aggregate", {
        method: "POST",
        headers: adminAuthHeader,
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(503);
    });
  });
});
