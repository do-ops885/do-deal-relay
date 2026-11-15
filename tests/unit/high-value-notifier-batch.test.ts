// Per-run subscription reuse for the high-value notifier (issue #1059).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyHighValueDealsWithWebhook } from "../../worker/lib/high-value-notifier";
import type { Deal, Env } from "../../worker/types";
import type { WebhookSubscription } from "../../worker/lib/webhook/types";

vi.mock("../../worker/lib/notify", () => ({
  notify: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../worker/lib/security", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../worker/lib/security")>();
  return {
    ...actual,
    validateFetchUrl: vi.fn().mockResolvedValue(true),
    validateUrl: vi.fn().mockReturnValue(true),
    validatedFetch: vi.fn(),
  };
});

vi.mock("../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  emitConsole: vi.fn(),
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
    list: vi.fn(async () => ({
      keys: [...storage.keys()].map((name) => ({ name })),
      list_complete: true,
      cursor: undefined,
    })),
    storage,
  };
}

function createDeal(id: string): Deal {
  return {
    id,
    source: {
      url: "https://example.com/deal",
      domain: "example.com",
      discovered_at: "2026-01-01T00:00:00Z",
      trust_score: 0.9,
    },
    title: `Deal ${id}`,
    description: "High value deal",
    code: `CODE${id}`,
    url: `https://example.com/deal/${id}`,
    reward: { type: "cash", value: 500, currency: "USD" },
    expiry: { confidence: 0.9, type: "soft" },
    metadata: {
      category: ["trading"],
      tags: [],
      normalized_at: "2026-01-01T00:00:00Z",
      confidence_score: 0.9,
      status: "active",
    },
  } as Deal;
}

const subscription: WebhookSubscription = {
  id: "sub_batch_1",
  owner_id: "owner_1",
  partner_id: "partner_1",
  url: "https://example.com/hook",
  events: ["high_value_deal"],
  secret: "whsec_batchsecret1234567890",
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("notifyHighValueDealsWithWebhook", () => {
  let kv: ReturnType<typeof createKv>;
  let queue: {
    sendBatch: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    kv = createKv();
    kv.storage.set(
      `webhook_subscription:${subscription.id}`,
      JSON.stringify(subscription),
    );
    queue = { sendBatch: vi.fn().mockResolvedValue(undefined), send: vi.fn() };
  });

  it("loads subscriptions once for a run with several deals", async () => {
    const env = {
      DEALS_STAGING: kv,
      DEALS_PROD: kv,
      WEBHOOK_QUEUE: queue,
      NOTIFICATION_THRESHOLD: "100",
      OUTBOUND_EGRESS_ALLOWED_HOSTS: "example.com",
      TRUST_THRESHOLD: "0.3",
    } as unknown as Env;

    const result = await notifyHighValueDealsWithWebhook(
      env,
      [createDeal("1"), createDeal("2"), createDeal("3")],
      "run_batch",
      "trace_batch",
    );

    expect(result.highValueCount).toBe(3);
    expect(result.webhookSent).toBe(3);
    expect(kv.list).toHaveBeenCalledTimes(1);
    expect(queue.sendBatch).toHaveBeenCalledTimes(3);
  });
});
