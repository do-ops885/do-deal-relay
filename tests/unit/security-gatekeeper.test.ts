import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../worker/index";
import { Env } from "../../worker/types";

describe("Security Gatekeeper", () => {
  const mockEnv = {
    DEALS_SOURCES: {
      get: vi.fn(),
      put: vi.fn(),
    },
    WEBHOOK_API_KEYS: {
      get: vi.fn(),
      put: vi.fn(),
    },
    DEALS_PROD: {} as KVNamespace,
    DEALS_LOG: {} as KVNamespace,
    AI_GATEWAY_URL: "https://gateway.test",
    TRUST_THRESHOLD: "0.3",
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const endpoints = [
    { path: "/api/discover", method: "POST" },
    { path: "/api/submit", method: "POST" },
    { path: "/api/referrals", method: "POST" },
    { path: "/api/referrals/test-code/deactivate", method: "POST" },
    { path: "/api/referrals/test-code/reactivate", method: "POST" },
    { path: "/api/research", method: "POST" },
    { path: "/api/experience/aggregate", method: "POST" },
  ];

  endpoints.forEach(({ path, method }) => {
    it(`should return 401 Unauthorized for ${method} ${path} without API key`, async () => {
      const request = new Request(`https://example.com${path}`, {
        method,
        headers:
          method === "POST" ? { "Content-Type": "application/json" } : {},
        body: method === "POST" ? JSON.stringify({}) : null,
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Missing API key");
    });

    it(`should return 401 Unauthorized for ${method} ${path} with invalid API key`, async () => {
      const request = new Request(`https://example.com${path}`, {
        method,
        headers: {
          "X-API-Key": "invalid-key",
          "Content-Type": "application/json",
        },
        body: method === "POST" ? JSON.stringify({}) : null,
      });

      const response = await worker.fetch(request, mockEnv);
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid API key format");
    });
  });

  it("should return 403 Forbidden for user role on admin endpoint", async () => {
    // Mock valid user API key
    vi.mocked(mockEnv.DEALS_SOURCES.get).mockResolvedValue({
      userId: "user-123",
      role: "user",
    });

    const request = new Request("https://example.com/api/discover", {
      method: "POST",
      headers: {
        "X-API-Key": "ddr_validuser_123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const response = await worker.fetch(request, mockEnv);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Required role: admin");
  });
});
