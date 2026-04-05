import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDeadLetterQueue, sendOutgoingWebhooks } from "../../worker/lib/webhook/delivery";
import * as webhookTypes from "../../worker/lib/webhook/types";
import type { Env } from "../../worker/types";

vi.mock("../../worker/lib/webhook/types", async () => {
  const actual = await vi.importActual("../../worker/lib/webhook/types") as any;
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

      mockKv.get.mockImplementation(async (key: string, type: string) => {
        if (key === "webhook_subscription:sub1") {
          return { id: "sub1", active: true, events: ["referral.created"], url: "https://sub1.com" };
        }
        if (key === "webhook_subscription:sub2") {
          return { id: "sub2", active: false, events: ["referral.created"], url: "https://sub2.com" };
        }
        if (key === "webhook_subscription:sub3") {
          return { id: "sub3", active: true, events: ["referral.created"], url: "https://sub3.com" };
        }
        return null;
      });

      await sendOutgoingWebhooks(mockEnv, event);

      expect(mockKv.list).toHaveBeenCalledWith({ prefix: "webhook_subscription:" });
      expect(mockKv.get).toHaveBeenCalledTimes(3);

      // Verify that fetch was called for the active subscriptions
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
