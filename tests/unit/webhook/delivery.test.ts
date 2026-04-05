import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendOutgoingWebhooks,
  getDeadLetterQueue,
  retryDeadLetterEvent,
} from "../../../worker/lib/webhook/delivery";
import type {
  WebhookEvent,
  WebhookSubscription,
  DeadLetterEvent,
} from "../../../worker/lib/webhook/types";

// ============================================================================
// Mock KV Namespace
// ============================================================================

function createMockKv() {
  const storage = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => storage.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    list: vi.fn(async ({ prefix }: { prefix: string }) => {
      const keys: { name: string }[] = [];
      for (const [key] of storage.entries()) {
        if (key.startsWith(prefix)) keys.push({ name: key });
      }
      return { keys };
    }),
    storage,
  };
}

type MockKv = ReturnType<typeof createMockKv>;
function createEnv(kv: MockKv) {
  return { DEALS_STAGING: kv } as any;
}

function createEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: "evt_test123",
    type: "referral.created",
    timestamp: "2024-01-01T00:00:00Z",
    data: { code: "TEST", url: "https://example.com", domain: "example.com" },
    metadata: { request_id: "req_1", trace_id: "trace_1" },
    ...overrides,
  };
}

function createSubscription(
  overrides: Partial<WebhookSubscription> = {},
): WebhookSubscription {
  return {
    id: "sub_test123",
    partner_id: "partner_1",
    url: "https://example.com/webhook",
    events: ["referral.created"],
    secret: "whsec_test1234567890abcdef",
    active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const mockOk = {
  status: 200,
  ok: true,
  headers: { get: () => null },
  text: async () => "OK",
} as unknown as Response;
const mockFail = {
  status: 500,
  ok: false,
  headers: { get: () => null },
  text: async () => "Server Error",
} as unknown as Response;

describe("Webhook Delivery", () => {
  let kv: MockKv;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    kv = createMockKv();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ============================================================================
  // sendOutgoingWebhooks() Tests
  // ============================================================================

  describe("sendOutgoingWebhooks()", () => {
    it("should do nothing when no subscriptions exist", async () => {
      await sendOutgoingWebhooks(createEnv(kv), createEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should do nothing when KV is unavailable", async () => {
      await expect(
        sendOutgoingWebhooks({} as any, createEvent()),
      ).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should send webhook to matching subscription", async () => {
      const env = createEnv(kv);
      const sub = createSubscription();
      kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
      fetchSpy.mockResolvedValue(mockOk);

      await sendOutgoingWebhooks(env, createEvent());

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({ method: "POST", body: expect.any(String) }),
      );
    });

    it("should not send to subscription with mismatched event type", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        `webhook_subscription:sub_x`,
        JSON.stringify(createSubscription({ events: ["referral.updated"] })),
      );
      await sendOutgoingWebhooks(env, createEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should not send to inactive subscription", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        `webhook_subscription:sub_x`,
        JSON.stringify(createSubscription({ active: false })),
      );
      await sendOutgoingWebhooks(env, createEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should filter by domain filter", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        `webhook_subscription:sub_x`,
        JSON.stringify(
          createSubscription({ filters: { domains: ["other.com"] } }),
        ),
      );
      await sendOutgoingWebhooks(env, createEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should allow event when domain matches filter", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        `webhook_subscription:sub_x`,
        JSON.stringify(
          createSubscription({ filters: { domains: ["example.com"] } }),
        ),
      );
      fetchSpy.mockResolvedValue(mockOk);
      await sendOutgoingWebhooks(env, createEvent());
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("should filter by status filter", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        `webhook_subscription:sub_x`,
        JSON.stringify(
          createSubscription({
            filters: { status: ["active"] },
          }),
        ),
      );
      await sendOutgoingWebhooks(
        env,
        createEvent({
          data: {
            status: "expired",
            code: "TEST",
            url: "https://example.com",
            domain: "example.com",
          },
        }),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should send to multiple matching subscriptions", async () => {
      const env = createEnv(kv);
      const s1 = createSubscription({
        id: "sub_1",
        url: "https://example.com/hook1",
      });
      const s2 = createSubscription({
        id: "sub_2",
        url: "https://example.com/hook2",
      });
      kv.storage.set(`webhook_subscription:${s1.id}`, JSON.stringify(s1));
      kv.storage.set(`webhook_subscription:${s2.id}`, JSON.stringify(s2));
      fetchSpy.mockResolvedValue(mockOk);

      await sendOutgoingWebhooks(env, createEvent());

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle fetch errors with retries", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        `webhook_subscription:sub_x`,
        JSON.stringify(
          createSubscription({
            retry_policy: {
              max_attempts: 2,
              initial_delay_ms: 10,
              max_delay_ms: 100,
              backoff_multiplier: 2,
            },
          }),
        ),
      );
      fetchSpy.mockRejectedValue(new Error("Network error"));

      await sendOutgoingWebhooks(env, createEvent());

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("should save delivery record to KV on success", async () => {
      const env = createEnv(kv);
      const sub = createSubscription();
      kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
      fetchSpy.mockResolvedValue(mockOk);

      const event = createEvent();
      await sendOutgoingWebhooks(env, event);

      expect(kv.storage.has(`webhook_delivery:${event.id}:${sub.id}`)).toBe(
        true,
      );
    });

    it("should add to DLQ after all retries fail", async () => {
      const env = createEnv(kv);
      const sub = createSubscription({
        retry_policy: {
          max_attempts: 2,
          initial_delay_ms: 10,
          max_delay_ms: 100,
          backoff_multiplier: 2,
        },
      });
      kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
      fetchSpy.mockResolvedValue(mockFail);

      const event = createEvent();
      await sendOutgoingWebhooks(env, event);

      expect(kv.storage.has(`webhook_dlq:${event.id}:${sub.id}`)).toBe(true);
    });
  });

  // ============================================================================
  // Dead Letter Queue Tests
  // ============================================================================

  describe("getDeadLetterQueue()", () => {
    it("should return empty array when no DLQ entries exist", async () => {
      expect(await getDeadLetterQueue(createEnv(kv))).toEqual([]);
    });

    it("should return empty array when KV is unavailable", async () => {
      expect(await getDeadLetterQueue({} as any)).toEqual([]);
    });

    it("should return all DLQ entries", async () => {
      const env = createEnv(kv);
      const e1: DeadLetterEvent = {
        delivery: {
          event_id: "evt_1",
          subscription_id: "sub_1",
          status: "failed",
          attempts: [{ timestamp: "2024-01-01T00:00:00Z", error: "timeout" }],
          created_at: "2024-01-01T00:00:00Z",
        },
        event: createEvent({ id: "evt_1" }),
        enqueued_at: "2024-01-01T00:00:00Z",
        retryable: true,
      };
      const e2: DeadLetterEvent = {
        delivery: {
          event_id: "evt_2",
          subscription_id: "sub_2",
          status: "failed",
          attempts: [{ timestamp: "2024-01-01T00:00:00Z", status_code: 500 }],
          created_at: "2024-01-01T00:00:00Z",
        },
        event: createEvent({ id: "evt_2" }),
        enqueued_at: "2024-01-01T00:00:00Z",
        retryable: false,
      };
      kv.storage.set("webhook_dlq:evt_1:sub_1", JSON.stringify(e1));
      kv.storage.set("webhook_dlq:evt_2:sub_2", JSON.stringify(e2));

      expect(await getDeadLetterQueue(env)).toHaveLength(2);
    });

    it("should return empty array on KV error", async () => {
      vi.mocked(kv.list).mockRejectedValue(new Error("KV error"));
      expect(await getDeadLetterQueue(createEnv(kv))).toEqual([]);
    });
  });

  describe("retryDeadLetterEvent()", () => {
    it("should return false when KV is unavailable", async () => {
      expect(await retryDeadLetterEvent({} as any, "e", "s")).toBe(false);
    });

    it("should return false when DLQ entry does not exist", async () => {
      expect(await retryDeadLetterEvent(createEnv(kv), "evt_no", "sub_1")).toBe(
        false,
      );
    });

    it("should retry DLQ event and send webhook", async () => {
      const env = createEnv(kv);
      const sub = createSubscription({ id: "sub_retry" });
      kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
      const entry: DeadLetterEvent = {
        delivery: {
          event_id: "evt_r",
          subscription_id: sub.id,
          status: "failed",
          attempts: [{ timestamp: "2024-01-01T00:00:00Z", error: "timeout" }],
          created_at: "2024-01-01T00:00:00Z",
        },
        event: createEvent({ id: "evt_r" }),
        enqueued_at: "2024-01-01T00:00:00Z",
        retryable: true,
      };
      kv.storage.set(`webhook_dlq:evt_r:${sub.id}`, JSON.stringify(entry));
      fetchSpy.mockResolvedValue(mockOk);

      const result = await retryDeadLetterEvent(env, "evt_r", sub.id);
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("should delete DLQ entry before retrying", async () => {
      const env = createEnv(kv);
      const sub = createSubscription({ id: "sub_del" });
      kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
      const entry: DeadLetterEvent = {
        delivery: {
          event_id: "evt_d",
          subscription_id: sub.id,
          status: "failed",
          attempts: [],
          created_at: "2024-01-01T00:00:00Z",
        },
        event: createEvent({ id: "evt_d" }),
        enqueued_at: "2024-01-01T00:00:00Z",
        retryable: true,
      };
      kv.storage.set(`webhook_dlq:evt_d:${sub.id}`, JSON.stringify(entry));
      fetchSpy.mockResolvedValue(mockOk);

      await retryDeadLetterEvent(env, "evt_d", sub.id);
      expect(kv.storage.has(`webhook_dlq:evt_d:${sub.id}`)).toBe(false);
    });

    it("should return false when subscription is inactive", async () => {
      const env = createEnv(kv);
      const sub = createSubscription({ id: "sub_ina", active: false });
      kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
      kv.storage.set(
        `webhook_dlq:evt_i:${sub.id}`,
        JSON.stringify({
          delivery: {
            event_id: "evt_i",
            subscription_id: sub.id,
            status: "failed",
            attempts: [],
            created_at: "2024-01-01T00:00:00Z",
          },
          event: createEvent({ id: "evt_i" }),
          enqueued_at: "2024-01-01T00:00:00Z",
          retryable: true,
        }),
      );

      expect(await retryDeadLetterEvent(env, "evt_i", sub.id)).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should return false when subscription does not exist", async () => {
      const env = createEnv(kv);
      kv.storage.set(
        "webhook_dlq:evt_ns:sub_gone",
        JSON.stringify({
          delivery: {
            event_id: "evt_ns",
            subscription_id: "sub_gone",
            status: "failed",
            attempts: [],
            created_at: "2024-01-01T00:00:00Z",
          },
          event: createEvent({ id: "evt_ns" }),
          enqueued_at: "2024-01-01T00:00:00Z",
          retryable: true,
        }),
      );

      expect(await retryDeadLetterEvent(env, "evt_ns", "sub_gone")).toBe(false);
    });
  });
});
