import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../worker/index";
import { notify } from "../../worker/notify";
import type { Env } from "../../worker/types";

// Mock notify module
vi.mock("../../worker/notify", () => ({
  notify: vi.fn(),
}));

describe("Worker Initialization", () => {
  const mockEnv = {
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    DEALS_PROD: { get: vi.fn() },
    DEALS_STAGING: { get: vi.fn() },
    DEALS_LOG: { get: vi.fn(), put: vi.fn() },
    DEALS_LOCK: { get: vi.fn() },
    DEALS_SOURCES: { get: vi.fn() },
    DEALS_PROD: {},
    DEALS_LOG: {},
    AI_GATEWAY_URL: "http://test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    DEALS_DB: {} as any,
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetch handler", () => {
    it("should return 503 when TRUST_THRESHOLD is invalid", async () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "invalid" };
      const request = new Request("https://example.com/health");

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(503);
      const body = (await response.json()) as any;
      expect(body.error).toBe("Configuration error");
      expect(body.message).toContain("must be a number between 0 and 1");
    });

    it("should return 503 when TRUST_THRESHOLD is out of range", async () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "1.5" };
      const request = new Request("https://example.com/health");

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(503);
      const body = (await response.json()) as any;
      expect(body.error).toBe("Configuration error");
      expect(body.message).toContain("must be a number between 0 and 1");
    });
  });

  describe("scheduled handler", () => {
    it("should send critical notification when TRUST_THRESHOLD is invalid", async () => {
      const env = { ...mockEnv, TRUST_THRESHOLD: "invalid" };
      const event = {
        cron: "0 * * * *",
        scheduledTime: Date.now(),
      } as ScheduledEvent;

      await worker.scheduled(event, env);

      expect(notify).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          type: "system_error",
          severity: "critical",
          message: expect.stringContaining("Configuration error"),
        }),
      );
    });
  });
});
