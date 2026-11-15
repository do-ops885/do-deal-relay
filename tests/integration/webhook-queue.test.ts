// Queue-backed webhook delivery: producer -> consumer redelivery -> DLQ replay.
//
// Runs the real producer, consumer, and DLQ code against a shared KV map and a
// fake queue that persists messages, so redelivery is exercised end to end
// instead of by calling the delivery helpers directly.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendOutgoingWebhooks,
  retryDeadLetterEvent,
  getDeadLetterQueue,
} from "../../worker/lib/webhook/delivery";
import { handleWebhookQueueBatch } from "../../worker/queues/webhook-consumer";
import type { WebhookQueueMessage } from "../../worker/lib/webhook/queue";
import type {
  WebhookEvent,
  WebhookSubscription,
} from "../../worker/lib/webhook/types";
import type { Env } from "../../worker/types";
import type { MessageBatch } from "@cloudflare/workers-types";

vi.mock("../../worker/lib/security", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../worker/lib/security")>();
  return {
    ...actual,
    validateFetchUrl: vi.fn().mockResolvedValue(true),
    validateUrl: vi.fn().mockReturnValue(true),
    validatedFetch: vi.fn((url: string, init?: RequestInit) =>
      globalThis.fetch(url, init),
    ),
  };
});

vi.mock("../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../worker/lib/webhook/metrics", () => ({
  WEBHOOK_METRICS: {
    ENQUEUE_TOTAL: "webhook_enqueue_total",
    ENQUEUE_LATENCY_MS: "webhook_enqueue_latency_ms",
    DELIVERY_TOTAL: "webhook_delivery_total",
    DELIVERY_LATENCY_MS: "webhook_delivery_latency_ms",
    RETRY_TOTAL: "webhook_retry_total",
    DLQ_DEPTH: "webhook_dlq_depth",
  },
  recordWebhookMetric: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../worker/lib/hmac", () => ({
  generateWebhookHeaders: vi.fn().mockResolvedValue({ "X-Signature": "sig" }),
  generateWebhookSecret: vi.fn().mockReturnValue("whsec_test"),
}));

function createKv() {
  const storage = new Map<string, string>();
  return {
    get: vi.fn(async (key: string, type?: string) => {
      const value = storage.get(key) ?? null;
      if (type === "json" && typeof value === "string")
        return JSON.parse(value);
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    list: vi.fn(async ({ prefix }: { prefix?: string } = {}) => {
      const keys: { name: string }[] = [];
      for (const key of storage.keys()) {
        if (!prefix || key.startsWith(prefix)) keys.push({ name: key });
      }
      return { keys, list_complete: true, cursor: undefined };
    }),
    storage,
  };
}

type FakeKv = ReturnType<typeof createKv>;

/**
 * Fake Cloudflare Queue that retains messages, so a test can redeliver the
 * same payload with a higher attempt count exactly as the platform would.
 */
function createQueue() {
  const messages: WebhookQueueMessage[] = [];
  return {
    messages,
    sendBatch: vi.fn(async (batch: { body: WebhookQueueMessage }[]) => {
      for (const item of batch) messages.push(item.body);
    }),
    send: vi.fn(async (body: WebhookQueueMessage) => {
      messages.push(body);
    }),
    drain(): WebhookQueueMessage | undefined {
      return messages.shift();
    },
  };
}

type FakeQueue = ReturnType<typeof createQueue>;

function createEnv(kv: FakeKv, queue?: FakeQueue) {
  return {
    DEALS_STAGING: kv,
    DEALS_PROD: kv,
    OUTBOUND_EGRESS_ALLOWED_HOSTS: "example.com",
    TRUST_THRESHOLD: "0.3",
    ...(queue ? { WEBHOOK_QUEUE: queue } : {}),
  } as unknown as Env;
}

function createEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: "evt_int_1",
    type: "referral.created",
    timestamp: "2026-01-01T00:00:00Z",
    data: { code: "INTEG", url: "https://example.com", domain: "example.com" },
    metadata: { request_id: "req_int", trace_id: "trace_int" },
    ...overrides,
  };
}

function createSubscription(
  overrides: Partial<WebhookSubscription> = {},
): WebhookSubscription {
  return {
    id: "sub_int_1",
    owner_id: "owner_1",
    partner_id: "partner_1",
    url: "https://example.com/hook",
    events: ["referral.created"],
    secret: "whsec_integrationsecret1234567890",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function seedSubscription(kv: FakeKv, sub: WebhookSubscription) {
  kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
}

function response(status: number): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    text: async () => `status ${status}`,
  } as unknown as Response;
}

/** One delivery round as the platform would run it: a single-message batch. */
async function consume(
  env: Env,
  message: WebhookQueueMessage,
  attempt: number,
): Promise<{ acked: boolean; retried: boolean }> {
  const acked = { value: false };
  const retried = { value: false };
  const msg = {
    id: `msg_${attempt}`,
    timestamp: new Date(),
    body: message,
    attempts: attempt,
    ack: () => {
      acked.value = true;
    },
    retry: () => {
      retried.value = true;
    },
  };
  const batch = {
    queue: "webhook-queue",
    messages: [msg],
  } as unknown as MessageBatch<WebhookQueueMessage>;

  await handleWebhookQueueBatch(batch, env);

  return { acked: acked.value, retried: retried.value };
}

interface DeliveryRecord {
  status: string;
  attempts: unknown[];
}

function readRecord(kv: FakeKv, key: string): DeliveryRecord | null {
  const raw = kv.storage.get(key);
  return raw === undefined ? null : (JSON.parse(raw) as DeliveryRecord);
}

describe("webhook queue end to end", () => {
  let kv: FakeKv;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    kv = createKv();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers an enqueued message once and ignores a duplicate redelivery", async () => {
    const queue = createQueue();
    const sub = createSubscription();
    seedSubscription(kv, sub);
    const env = createEnv(kv, queue);
    fetchSpy.mockResolvedValue(response(200));

    await sendOutgoingWebhooks(env, createEvent());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(queue.messages).toHaveLength(1);

    const message = queue.drain();
    expect(message).toBeDefined();
    if (!message) throw new Error("expected an enqueued message");

    const first = await consume(env, message, 1);
    expect(first.acked).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(readRecord(kv, "webhook_delivery:evt_int_1:sub_int_1")?.status).toBe(
      "delivered",
    );

    // The platform redelivers the same message after an ack was lost.
    const duplicate = await consume(env, message, 2);
    expect(duplicate.acked).toBe(true);
    expect(duplicate.retried).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures within the budget, then dead-letters", async () => {
    const queue = createQueue();
    const sub = createSubscription({
      retry_policy: {
        max_attempts: 2,
        initial_delay_ms: 0,
        max_delay_ms: 0,
        backoff_multiplier: 1,
      },
    });
    seedSubscription(kv, sub);
    const env = createEnv(kv, queue);
    fetchSpy.mockResolvedValue(response(500));

    await sendOutgoingWebhooks(env, createEvent());
    const message = queue.drain();
    if (!message) throw new Error("expected an enqueued message");

    const attemptOne = await consume(env, message, 1);
    expect(attemptOne.retried).toBe(true);
    expect(attemptOne.acked).toBe(false);
    expect(readRecord(kv, "webhook_delivery:evt_int_1:sub_int_1")?.status).toBe(
      "retrying",
    );

    const attemptTwo = await consume(env, message, 2);
    expect(attemptTwo.acked).toBe(true);
    expect(attemptTwo.retried).toBe(false);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(readRecord(kv, "webhook_delivery:evt_int_1:sub_int_1")?.status).toBe(
      "failed",
    );
    const dlq = await getDeadLetterQueue(env);
    expect(dlq).toHaveLength(1);
    expect(dlq[0]?.event.id).toBe("evt_int_1");
  });

  it("replays a dead-lettered delivery through the queue exactly once", async () => {
    const queue = createQueue();
    const sub = createSubscription();
    seedSubscription(kv, sub);
    const env = createEnv(kv, queue);

    // Permanent failure puts the delivery in the DLQ.
    fetchSpy.mockResolvedValue(response(400));
    await sendOutgoingWebhooks(env, createEvent());
    const failed = queue.drain();
    if (!failed) throw new Error("expected an enqueued message");
    await consume(env, failed, 1);

    const beforeReplay = await getDeadLetterQueue(env);
    expect(beforeReplay).toHaveLength(1);

    // The subscriber recovers; replay re-enqueues the original identity.
    fetchSpy.mockResolvedValue(response(200));
    const replayed = await retryDeadLetterEvent(env, "evt_int_1", sub.id);
    expect(replayed).toBe(true);
    expect(queue.messages).toHaveLength(1);

    const replayMessage = queue.drain();
    if (!replayMessage) throw new Error("expected a replayed message");
    expect(replayMessage.deliveryId).toBe("evt_int_1:sub_int_1");

    const consumed = await consume(env, replayMessage, 1);
    expect(consumed.acked).toBe(true);
    expect(readRecord(kv, "webhook_delivery:evt_int_1:sub_int_1")?.status).toBe(
      "delivered",
    );
    expect(await getDeadLetterQueue(env)).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
