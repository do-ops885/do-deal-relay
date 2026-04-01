import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notify, notifyHighValueDeals } from "../../worker/notify";
import { setGitHubToken } from "../../worker/lib/github";
import type { Env, NotificationEvent } from "../../worker/types";

describe("Notification System", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockKvStorage = new Map();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setGitHubToken("test-token");

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string) => mockKvStorage.get(key) as T),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(key, JSON.parse(value));
        }),
      } as unknown as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {
        get: vi.fn(async () => []),
      } as unknown as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      GITHUB_TOKEN: "test-token",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("notify", () => {
    it("should deduplicate notifications within cooldown", async () => {
      const event: NotificationEvent = {
        type: "system_error",
        severity: "critical",
        run_id: "test-run",
        message: "Test error",
      };

      // Record a recent notification
      mockKvStorage.set("meta:notifications", [
        {
          type: "system_error",
          source: "system",
          timestamp: new Date().toISOString(),
        },
      ]);

      const result = await notify(mockEnv, event);

      expect(result).toBe(false);
    });

    it("should send Telegram notification when configured", async () => {
      mockEnv.TELEGRAM_BOT_TOKEN = "bot-token";
      mockEnv.TELEGRAM_CHAT_ID = "chat-id";

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const event: NotificationEvent = {
        type: "system_error",
        severity: "critical",
        run_id: "test-run",
        message: "Test error",
      };

      const result = await notify(mockEnv, event);

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.telegram.org/botbot-token/sendMessage",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining("Test error"),
        }),
      );
    });

    it("should handle Telegram API failure", async () => {
      mockEnv.TELEGRAM_BOT_TOKEN = "bot-token";
      mockEnv.TELEGRAM_CHAT_ID = "chat-id";

      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
      });

      const event: NotificationEvent = {
        type: "system_error",
        severity: "critical",
        run_id: "test-run",
        message: "Test error",
      };

      const result = await notify(mockEnv, event);

      // Should fallback to GitHub, which will fail without token
      expect(fetchMock).toHaveBeenCalled();
    });

    it("should fallback to GitHub when Telegram not configured", async () => {
      mockEnv.GITHUB_TOKEN = "github-token";

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ number: 123 }),
      });

      const event: NotificationEvent = {
        type: "checks_failed",
        severity: "critical",
        run_id: "test-run",
        message: "Validation failed",
      };

      const result = await notify(mockEnv, event);

      expect(result).toBe(true);
    });

    it("should handle notification failure", async () => {
      // No GitHub token, no Telegram config
      fetchMock.mockRejectedValue(new Error("Network error"));

      const event: NotificationEvent = {
        type: "system_error",
        severity: "warning",
        run_id: "test-run",
        message: "Test warning",
      };

      const result = await notify(mockEnv, event);

      expect(result).toBe(false);
    });

    it("should include context in notification", async () => {
      mockEnv.TELEGRAM_BOT_TOKEN = "bot-token";
      mockEnv.TELEGRAM_CHAT_ID = "chat-id";

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const event: NotificationEvent = {
        type: "high_value_deal",
        severity: "info",
        run_id: "test-run",
        message: "High value deal found",
        context: { code: "TEST123", reward: 150 },
      };

      await notify(mockEnv, event);

      const callBody = JSON.parse(
        (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(callBody.text).toContain("TEST123");
    });

    it("should use correct emoji for severity", async () => {
      mockEnv.TELEGRAM_BOT_TOKEN = "bot-token";
      mockEnv.TELEGRAM_CHAT_ID = "chat-id";

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      // Test critical (force=true to bypass dedupe)
      await notify(
        mockEnv,
        {
          type: "system_error",
          severity: "critical",
          run_id: "test-run",
          message: "Critical",
        },
        true,
      );
      let callBody = JSON.parse(
        (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(callBody.text).toContain("🚨");

      // Test warning (force=true to bypass dedupe)
      await notify(
        mockEnv,
        {
          type: "system_error",
          severity: "warning",
          run_id: "test-run",
          message: "Warning",
        },
        true,
      );
      callBody = JSON.parse(
        (fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(callBody.text).toContain("⚠️");

      // Test info (force=true to bypass dedupe)
      await notify(
        mockEnv,
        {
          type: "system_error",
          severity: "info",
          run_id: "test-run",
          message: "Info",
        },
        true,
      );
      callBody = JSON.parse(
        (fetchMock.mock.calls[2] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(callBody.text).toContain("ℹ️");
    });

    it("should trim notification history", async () => {
      // Create 150 existing notifications
      const notifications = Array(150)
        .fill(null)
        .map((_, i) => ({
          type: "system_error",
          source: "system",
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
        }));
      mockKvStorage.set("meta:notifications", notifications);

      mockEnv.TELEGRAM_BOT_TOKEN = "bot-token";
      mockEnv.TELEGRAM_CHAT_ID = "chat-id";

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const event: NotificationEvent = {
        type: "system_error",
        severity: "info",
        run_id: "test-run",
        message: "Test",
      };

      // Use force=true to bypass cooldown dedupe
      await notify(mockEnv, event, true);

      const putCall = (
        mockEnv.DEALS_PROD.put as ReturnType<typeof vi.fn>
      ).mock.calls.find((call) => call[0] === "meta:notifications");
      expect(putCall).toBeDefined();
      const storedNotifications = JSON.parse(putCall![1]);
      expect(storedNotifications.length).toBeLessThanOrEqual(100);
    });
  });

  describe("notifyHighValueDeals", () => {
    it("should send notification for high-value deals", async () => {
      mockEnv.TELEGRAM_BOT_TOKEN = "bot-token";
      mockEnv.TELEGRAM_CHAT_ID = "chat-id";

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const deals = [
        { code: "DEAL1", reward: 150 },
        { code: "DEAL2", reward: 200 },
      ];

      await notifyHighValueDeals(mockEnv, deals, "test-run");

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("should handle notification failures gracefully", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const deals = [{ code: "DEAL1", reward: 150 }];

      // Should not throw
      await expect(
        notifyHighValueDeals(mockEnv, deals, "test-run"),
      ).resolves.not.toThrow();
    });
  });
});
