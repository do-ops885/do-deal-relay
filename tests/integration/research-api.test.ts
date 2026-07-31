import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index";
import type { Env } from "../../worker/types";

describe("Research API Integration", () => {
  const authHeader = { "X-API-Key": "ddr_admin_test_key_123" };
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  function mockKvFactory(prefix: string) {
    return {
      get: vi.fn(async (key: string, type?: string) => {
        const fullKey = `${prefix}:${key}`;
        const value = mockKvStorage.get(fullKey);
        if (value === undefined) return null;
        if (type === "json" && typeof value === "string") {
          return JSON.parse(value);
        }
        return value;
      }),
      put: vi.fn(async (key: string, value: string) => {
        const fullKey = `${prefix}:${key}`;
        mockKvStorage.set(fullKey, value);
      }),
    };
  }

  beforeEach(async () => {
    mockKvStorage = new Map();
    // Set up auth
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
      JSON.stringify({ role: "admin", userId: "test-user" }),
    );

    mockEnv = {
      DEALS_SOURCES: mockKvFactory("sources"),
      DEALS_PROD: mockKvFactory("prod"),
      DEALS_LOG: mockKvFactory("log"),
      DEALS_LOCK: mockKvFactory("lock"),
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      TRUST_THRESHOLD: "0.5",
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: {} as any,
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should use simulated mode by default in test environment", async () => {
    const request = new Request("http://localhost/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({
        query: "test query",
      }),
    });

    const response = await worker.fetch(request, mockEnv, mockCtx);
    const body = (await response.json()) as {
      research_metadata: {
        used_real_fetching: boolean;
        errors: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.research_metadata.used_real_fetching).toBe(false);
    // Simulated sources usually have "(simulated)" in their name in some places,
    // but here we check used_real_fetching flag in metadata.
  });

  it("should keep real fetching disabled in production without opt-in", async () => {
    mockEnv.ENVIRONMENT = "production";

    // Mock fetch for real fetching attempt
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const request = new Request("http://localhost/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({
        query: "test query",
      }),
    });

    const response = await worker.fetch(request, mockEnv, mockCtx);
    const body = (await response.json()) as {
      research_metadata: {
        used_real_fetching: boolean;
        errors: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.research_metadata.used_real_fetching).toBe(false);
  });

  it("should use real fetching when RESEARCH_USE_REAL_FETCHING is true", async () => {
    mockEnv.RESEARCH_USE_REAL_FETCHING = "true";

    // Mock fetch for real fetching attempt
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const request = new Request("http://localhost/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({
        query: "test query",
      }),
    });

    const response = await worker.fetch(request, mockEnv, mockCtx);
    const body = (await response.json()) as {
      research_metadata: {
        used_real_fetching: boolean;
        errors: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.research_metadata.used_real_fetching).toBe(true);
  });

  it("should respect explicit use_real_fetching option in request body", async () => {
    const request = new Request("http://localhost/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({
        query: "test query",
        options: {
          use_real_fetching: true,
        },
      }),
    });

    // Mock fetch for real fetching attempt
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const response = await worker.fetch(request, mockEnv, mockCtx);
    const body = (await response.json()) as {
      research_metadata: {
        used_real_fetching: boolean;
        errors: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.research_metadata.used_real_fetching).toBe(true);
  });

  it("should handle rate limiting for real requests", async () => {
    mockEnv.RESEARCH_USE_REAL_FETCHING = "true";

    // We need to trigger rate limit.
    // The researchRateLimiter is global in the module, so we might need to reset it or fill it.
    // In orchestrator.ts it uses researchRateLimiter from fetcher.ts.

    const { researchRateLimiter } =
      await import("../../worker/lib/research-agent/fetcher");
    // Fill the rate limiter for a source
    for (let i = 0; i < 11; i++) {
      researchRateLimiter.recordRequest("producthunt");
    }

    const request = new Request("http://localhost/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({
        query: "test query",
        sources: ["producthunt"],
      }),
    });

    const response = await worker.fetch(request, mockEnv, mockCtx);
    const body = (await response.json()) as {
      research_metadata: {
        used_real_fetching: boolean;
        errors: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.research_metadata.errors).toBeDefined();
    expect(
      body.research_metadata.errors.some((e) => e.includes("Rate limited")),
    ).toBe(true);
  });
});
