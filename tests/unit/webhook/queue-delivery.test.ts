import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendOutgoingWebhooks,
  getDeadLetterQueue,
  retryDeadLetterEvent,
} from "../../../worker/lib/webhook/delivery";
import { handleWebhookQueueBatch } from "../../../worker/queues/webhook-consumer";
import type {
  WebhookEvent,
  WebhookSubscription,
  DeadLetterEvent,
} from "../../../worker/lib/webhook/types";
import type { WebhookQueueMessage } from "../../../worker/lib/webhook/queue";
import type { Env } from "../../../worker/types";
import type { MessageBatch } from "@cloudflare/workers-types";

vi.mock("../../../worker/lib/security", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/lib/security")>();
  return {
    ...actual,
    validateFetchUrl: vi.fn().mockResolvedValue(true),
    validateUrl: vi.fn().mockReturnValue(true),
    validatedFetch: vi.fn((url, init) => globalThis.fetch(url, init)),
  };
});

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../worker/lib/webhook/metrics", () => ({
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

vi.mock("../../../worker/lib/hmac", () => ({
  generateWebhookHeaders: vi.fn().mockResolvedValue({ "X-Signature": "sig" }),
  generateWebhookSecret: vi.fn().mockReturnValue("whsec_test"),
}));

function createMockKv() {
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
    list: vi.fn(async ({ prefix }: { prefix: string }) => {
      const keys: { name: string }[] = [];
      for (const key of storage.keys()) {
        if (key.startsWith(prefix)) keys.push({ name: key });
      }
      return { keys };
    }),
    storage,
  };
}

type MockKv = ReturnType<typeof createMockKv>;

function readStored<T>(kv: MockKv, key: string): T | null {
  const raw = kv.storage.get(key);
  if (raw === undefined) return null;
  return JSON.parse(raw) as T;
}

function createEnv(kv: MockKv, queue?: unknown) {
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
    id: "evt_1",
    type: "referral.created",
    timestamp: "2026-01-01T00:00:00Z",
    data: { code: "TEST", url: "https://example.com", domain: "example.com" },
    metadata: { request_id: "req_1", trace_id: "trace_1" },
    ...overrides,
  };
}

function createSubscription(
  overrides: Partial<WebhookSubscription> = {},
): WebhookSubscription {
  return {
    id: "sub_1",
    owner_id: "owner_1",
    partner_id: "partner_1",
    url: "https://example.com/webhook",
    events: ["referral.created"],
    secret: "whsec_test1234567890abcdef",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createQueue() {
  return {
    sendBatch: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function sentBatch(
  queue: ReturnType<typeof createQueue>,
): { body: WebhookQueueMessage }[] {
  const call = queue.sendBatch.mock.calls.at(0);
  if (!call) return [];
  return call[0] as { body: WebhookQueueMessage }[];
}

function sentMessage(
  queue: ReturnType<typeof createQueue>,
): WebhookQueueMessage | null {
  const call = queue.send.mock.calls.at(0);
  if (!call) return null;
  return call[0] as WebhookQueueMessage;
}

function createMessage(body: unknown, attempts = 1) {
  return {
    id: "msg_1",
    timestamp: new Date(),
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

type TestMessage = ReturnType<typeof createMessage>;

function createBatch(
  messages: TestMessage[],
): MessageBatch<WebhookQueueMessage> {
  return {
    queue: "webhook-queue",
    messages,
  } as unknown as MessageBatch<WebhookQueueMessage>;
}

function seedSubscription(kv: MockKv, sub: WebhookSubscription) {
  kv.storage.set(`webhook_subscription:${sub.id}`, JSON.stringify(sub));
}

const mockOk = {
  status: 200,
  ok: true,
  headers: { get: () => null },
  text: async () => "OK",
} as unknown as Response;
const mockServerError = {
  status: 500,
  ok: false,
  headers: { get: () => null },
  text: async () => "Server Error",
} as unknown as Response;
const mockBadRequest = {
  status: 400,
  ok: false,
  headers: { get: () => null },
  text: async () => "Bad Request",
} as unknown as Response;

interface DeliveryRecordShape {
  status: string;
  attempts: unknown[];
  delivered_at?: string;
}

interface DlqShape {
  delivery: DeliveryRecordShape;
  event: WebhookEvent;
}

describe("Webhook queue producer", () => {
  let kv: MockKv;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    kv = createMockKv();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  it("returns after durable enqueue without calling the subscriber", async () => {
    const queue = createQueue();
    seedSubscription(kv, createSubscription());
    fetchSpy.mockResolvedValue(mockOk);

    await sendOutgoingWebhooks(createEnv(kv, queue), createEvent());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(queue.sendBatch).toHaveBeenCalledTimes(1);

    const sent = sentBatch(queue);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body.deliveryId).toBe("evt_1:sub_1");
    expect(sent[0]?.body.event.id).toBe("evt_1");
    expect(sent[0]?.body.subscriptionId).toBe("sub_1");
  });

  it("persists a pending delivery record before enqueueing", async () => {
    const queue = createQueue();
    seedSubscription(kv, createSubscription());

    await sendOutgoingWebhooks(createEnv(kv, queue), createEvent());

    const record = readStored<DeliveryRecordShape>(
      kv,
      "webhook_delivery:evt_1:sub_1",
    );
    expect(record?.status).toBe("pending");
    expect(record?.attempts).toEqual([]);
  });

  it("does not re-enqueue or reset an already delivered subscription", async () => {
    const queue = createQueue();
    seedSubscription(kv, createSubscription());
    kv.storage.set(
      "webhook_delivery:evt_1:sub_1",
      JSON.stringify({
        event_id: "evt_1",
        subscription_id: "sub_1",
        status: "delivered",
        attempts: [{ timestamp: "2026-01-01T00:00:00Z", status_code: 200 }],
        created_at: "2026-01-01T00:00:00Z",
        delivered_at: "2026-01-01T00:00:00Z",
      }),
    );

    await sendOutgoingWebhooks(createEnv(kv, queue), createEvent());

    expect(queue.sendBatch).not.toHaveBeenCalled();
    expect(
      readStored<DeliveryRecordShape>(kv, "webhook_delivery:evt_1:sub_1")
        ?.status,
    ).toBe("delivered");
  });

  it("falls back to inline delivery when enqueue fails", async () => {
    const queue = createQueue();
    queue.sendBatch.mockRejectedValue(new Error("queue unavailable"));
    seedSubscription(kv, createSubscription());
    fetchSpy.mockResolvedValue(mockOk);

    await sendOutgoingWebhooks(createEnv(kv, queue), createEvent());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Webhook queue consumer", () => {
  let kv: MockKv;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    kv = createMockKv();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  function messageBody(): WebhookQueueMessage {
    return {
      deliveryId: "evt_1:sub_1",
      event: createEvent(),
      subscriptionId: "sub_1",
      enqueuedAt: "2026-01-01T00:00:00Z",
    };
  }

  it("acks a delivered message and records the delivery", async () => {
    seedSubscription(kv, createSubscription());
    fetchSpy.mockResolvedValue(mockOk);
    const msg = createMessage(messageBody());

    await handleWebhookQueueBatch(createBatch([msg]), createEnv(kv));

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
    const record = readStored<DeliveryRecordShape>(
      kv,
      "webhook_delivery:evt_1:sub_1",
    );
    expect(record?.status).toBe("delivered");
    expect(record?.delivered_at).toBeDefined();
  });

  it("retries a transient failure and preserves attempt history", async () => {
    seedSubscription(kv, createSubscription());
    fetchSpy.mockResolvedValue(mockServerError);
    const msg = createMessage(messageBody(), 2);

    await handleWebhookQueueBatch(createBatch([msg]), createEnv(kv));

    expect(msg.retry).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    const record = readStored<DeliveryRecordShape>(
      kv,
      "webhook_delivery:evt_1:sub_1",
    );
    expect(record?.status).toBe("retrying");
    expect(record?.attempts).toHaveLength(1);
  });

  it("sends a permanent failure to the DLQ and acks", async () => {
    seedSubscription(kv, createSubscription());
    fetchSpy.mockResolvedValue(mockBadRequest);
    const msg = createMessage(messageBody());

    await handleWebhookQueueBatch(createBatch([msg]), createEnv(kv));

    expect(msg.ack).toHaveBeenCalledTimes(1);
    const dlq = readStored<DlqShape>(kv, "webhook_dlq:evt_1:sub_1");
    expect(dlq?.delivery.status).toBe("failed");
    expect(dlq?.event.id).toBe("evt_1");
  });

  it("sends an exhausted retryable failure to the DLQ", async () => {
    seedSubscription(kv, createSubscription());
    fetchSpy.mockResolvedValue(mockServerError);
    const msg = createMessage(messageBody(), 5);

    await handleWebhookQueueBatch(createBatch([msg]), createEnv(kv));

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(kv.storage.has("webhook_dlq:evt_1:sub_1")).toBe(true);
  });

  it("suppresses a duplicate of an already delivered message", async () => {
    seedSubscription(kv, createSubscription());
    kv.storage.set(
      "webhook_delivery:evt_1:sub_1",
      JSON.stringify({
        event_id: "evt_1",
        subscription_id: "sub_1",
        status: "delivered",
        attempts: [],
        created_at: "2026-01-01T00:00:00Z",
      }),
    );
    const msg = createMessage(messageBody(), 3);

    await handleWebhookQueueBatch(createBatch([msg]), createEnv(kv));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it("acks and drops a malformed message", async () => {
    const msg = createMessage({ event: null });
    fetchSpy.mockResolvedValue(mockOk);

    await handleWebhookQueueBatch(createBatch([msg]), createEnv(kv));

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries the message when processing throws", async () => {
    seedSubscription(kv, createSubscription());
    const msg = createMessage(messageBody());
    const getSpy = vi
      .spyOn(kv, "get")
      .mockRejectedValue(new Error("KV unavailable"));

    await handleWebhookQueueBatch(createBatch([msg]), createEnv(kv));

    expect(msg.retry).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });
});

describe("Webhook DLQ replay", () => {
  let kv: MockKv;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    kv = createMockKv();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  function seedDlq(sub: WebhookSubscription) {
    const entry: DeadLetterEvent = {
      delivery: {
        event_id: "evt_1",
        subscription_id: sub.id,
        status: "failed",
        attempts: [{ timestamp: "2026-01-01T00:00:00Z", status_code: 500 }],
        created_at: "2026-01-01T00:00:00Z",
      },
      event: createEvent(),
      enqueued_at: "2026-01-01T00:00:00Z",
      retryable: true,
    };
    kv.storage.set(`webhook_dlq:evt_1:${sub.id}`, JSON.stringify(entry));
  }

  it("re-enqueues the original delivery ID when a queue is bound", async () => {
    const sub = createSubscription();
    seedSubscription(kv, sub);
    seedDlq(sub);
    const queue = createQueue();

    const result = await retryDeadLetterEvent(
      createEnv(kv, queue),
      "evt_1",
      sub.id,
    );

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sentMessage(queue)?.deliveryId).toBe("evt_1:sub_1");
    expect(kv.storage.has("webhook_dlq:evt_1:sub_1")).toBe(false);
  });

  it("does not notify twice when the identity is already delivered", async () => {
    const sub = createSubscription();
    seedSubscription(kv, sub);
    seedDlq(sub);
    kv.storage.set(
      "webhook_delivery:evt_1:sub_1",
      JSON.stringify({
        event_id: "evt_1",
        subscription_id: "sub_1",
        status: "delivered",
        attempts: [],
        created_at: "2026-01-01T00:00:00Z",
      }),
    );

    const result = await retryDeadLetterEvent(createEnv(kv), "evt_1", sub.id);

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(kv.storage.has("webhook_dlq:evt_1:sub_1")).toBe(false);
  });

  it("keeps a still-failing entry inspectable", async () => {
    const sub = createSubscription();
    seedSubscription(kv, sub);
    seedDlq(sub);
    fetchSpy.mockResolvedValue(mockServerError);

    const result = await retryDeadLetterEvent(createEnv(kv), "evt_1", sub.id);

    expect(result).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(kv.storage.has("webhook_dlq:evt_1:sub_1")).toBe(true);
    expect(await getDeadLetterQueue(createEnv(kv))).toHaveLength(1);
  });

  it("keeps the entry when the subscription is inactive", async () => {
    const sub = createSubscription({ active: false });
    seedSubscription(kv, sub);
    seedDlq(sub);

    const result = await retryDeadLetterEvent(createEnv(kv), "evt_1", sub.id);

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(kv.storage.has("webhook_dlq:evt_1:sub_1")).toBe(true);
  });

  it("returns false for an unknown DLQ entry", async () => {
    expect(
      await retryDeadLetterEvent(createEnv(kv), "evt_missing", "sub_x"),
    ).toBe(false);
  });
});
