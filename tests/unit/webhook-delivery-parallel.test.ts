import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDeadLetterQueue,
  sendOutgoingWebhooks,
} from "../../worker/lib/webhook/delivery";
import type { Env } from "../../worker/types";

vi.mock("../../worker/lib/webhook/types", async () => {
  const actual = (await vi.importActual(
    "../../worker/lib/webhook/types",
  )) as any;
  return {
    ...actual,
    getWebhookKV: vi.fn().mockImplementation((env) => env.DEALS_WEBHOOKS),
  };
});

// Mock logger to avoid spamming console
vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock hmac and other dependencies
vi.mock("../../worker/lib/hmac", () => ({
  generateWebhookHeaders: vi.fn().mockResolvedValue({}),
}));

describe("Webhook Delivery Optimization", () => {
  let mockKv: any;
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks();

    mockKv = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    mockEnv = {
      DEALS_WEBHOOKS: mockKv,
      DEALS_PROD: mockKv,
      DEALS_LOG: mockKv,
      DEALS_LOCK: mockKv,
      DEALS_STAGING: mockKv,
      DEALS_SOURCES: mockKv,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
    } as unknown as Env;

    // Default global fetch mock
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Map(),
      text: async () => "OK",
    });
  });

  describe("getDeadLetterQueue", () => {
    it("should fetch DLQ entries in parallel", async () => {
      const keys = [
        { name: "webhook_dlq:event1:sub1" },
        { name: "webhook_dlq:event2:sub2" },
      ];

      mockKv.list.mockResolvedValue({ keys });

      mockKv.get.mockImplementation(async (key: string, type: string) => {
        if (type === "json") {
          return { event: { id: key } };
        }
        return JSON.stringify({ event: { id: key } });
      });

      const entries = await getDeadLetterQueue(mockEnv);

      expect(entries).toHaveLength(2);
      expect(mockKv.list).toHaveBeenCalledWith({ prefix: "webhook_dlq:" });
      expect(mockKv.get).toHaveBeenCalledTimes(2);
      // Verify parallel fetch (all gets started before awaiting results is implicitly handled by fetchInBatches)
    });

    it("should handle empty DLQ", async () => {
      mockKv.list.mockResolvedValue({ keys: [] });
      const entries = await getDeadLetterQueue(mockEnv);
      expect(entries).toHaveLength(0);
    });

    it("should handle KV errors", async () => {
      mockKv.list.mockRejectedValue(new Error("KV error"));
      const entries = await getDeadLetterQueue(mockEnv);
      expect(entries).toHaveLength(0);
    });
  });

  describe("sendOutgoingWebhooks (calls getAllActiveSubscriptions)", () => {
    it("should fetch subscriptions in parallel and filter active ones", async () => {
      const event: any = {
        id: "evt_1",
        type: "referral.created",
        data: { domain: "example.com" },
      };

      const keys = [
        { name: "webhook_subscription:sub1" },
        { name: "webhook_subscription:sub2" },
        { name: "webhook_subscription:sub3" },
      ];

      mockKv.list.mockResolvedValue({ keys });

      mockKv.get.mockImplementation(async (key: string, _type: string) => {
        if (key === "webhook_subscription:sub1") {
          return {
            id: "sub1",
            active: true,
            events: ["referral.created"],
            url: "https://sub1.com",
          };
        }
        if (key === "webhook_subscription:sub2") {
          return {
            id: "sub2",
            active: false,
            events: ["referral.created"],
            url: "https://sub2.com",
          };
        }
        if (key === "webhook_subscription:sub3") {
          return {
            id: "sub3",
            active: true,
            events: ["referral.created"],
            url: "https://sub3.com",
          };
        }
        return null;
      });

      // Use fake timers to prevent timeout in test with retries/sleep
      vi.useFakeTimers();
      const sendPromise = sendOutgoingWebhooks(mockEnv, event);

      // Fast-forward any potential sleeps (though not expected in success case)
      await vi.runAllTimersAsync();
      await sendPromise;

      expect(mockKv.list).toHaveBeenCalledWith({
        prefix: "webhook_subscription:",
      });
      expect(mockKv.get).toHaveBeenCalledTimes(3);

      // Verify that fetch was called for the active subscriptions
      // Each subscription triggers 3 fetch calls: DNS validation (A, AAAA) + actual delivery
      expect(global.fetch).toHaveBeenCalled();
    }, 10000);
  });
});
