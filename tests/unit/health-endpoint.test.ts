import { describe, it, expect, vi } from "vitest";
import type { Env } from "../../worker/types";

describe("System Health Endpoint", () => {
  function createMockEnv(): Env {
    return {
      DEALS_PROD: { get: vi.fn(), put: vi.fn(), list: vi.fn() },
      DEALS_STAGING: { get: vi.fn(), put: vi.fn(), list: vi.fn() },
      DEALS_LOG: { get: vi.fn(), put: vi.fn(), list: vi.fn() },
      DEALS_LOCK: { get: vi.fn(), put: vi.fn(), list: vi.fn() },
      DEALS_SOURCES: { get: vi.fn(), put: vi.fn(), list: vi.fn() },
      DEALS_DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ test: 1 }),
          run: vi.fn().mockResolvedValue({ success: true }),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      },
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      AI: undefined,
    } as unknown as Env;
  }

  it("should return system health status", async () => {
    const { handleSystemHealth } = await import("../../worker/routes/health");
    const response = await handleSystemHealth(createMockEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.status).toBeDefined();
    expect(body.version).toBeDefined();
  });

  it("should report D1 connectivity in health", async () => {
    const { handleSystemHealth } = await import("../../worker/routes/health");
    const response = await handleSystemHealth(createMockEnv());
    const body = (await response.json()) as any;
    expect(body.checks).toBeDefined();
  });
});
