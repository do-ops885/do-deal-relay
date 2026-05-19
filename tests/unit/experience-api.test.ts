import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index";
import type { Env } from "../../worker/types";

const createMockEnv = (overrides: Partial<Env> = {}): Env => {
  const mockKv = {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => ({ keys: [], list_complete: true })),
  } as any;

  const env = {
    DEALS_PROD: mockKv,
    DEALS_STAGING: mockKv,
    DEALS_LOG: mockKv,
    DEALS_LOCK: mockKv,
    DEALS_SOURCES: mockKv,
    AI_GATEWAY_URL: "https://gateway.test",
    TRUST_THRESHOLD: "0.3",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    DEALS_DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
      withSession: vi.fn().mockReturnValue({
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        }),
        getBookmark: vi.fn().mockReturnValue("test-bookmark"),
      }),
    } as any,
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    ...overrides,
  } as Env;

  return env;
};

describe("Experience API Endpoints", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("POST /api/experience", () => {
    it("should return 503 when DEALS_DB is missing from config", async () => {
      const mockEnv = createMockEnv({ DEALS_DB: undefined });
      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_code: "DEAL123", event_type: "click" }),
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(503);
      const body = (await response.json()) as any;
      expect(body.error).toBe("Configuration error");
    });

    it("should return 415 for non-JSON content type", async () => {
      const mockEnv = createMockEnv();
      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(415);
    });

    it("should return 400 for missing required fields", async () => {
      const mockEnv = createMockEnv();
      const request = new Request("http://localhost/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_code: "DEAL123" }),
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/experience/:deal_code", () => {
    it("should return 200 and empty aggregate when no data exists", async () => {
      const mockEnv = createMockEnv();
      const request = new Request("http://localhost/api/experience/DEAL123");
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.total_events).toBe(0);
    });
  });
});
