import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MessageBatch } from "@cloudflare/workers-types";
import {
  computeAlertId,
  buildAlertDispatchMessage,
  dispatchAlertNotification,
  processAlertQueueBatch,
  processAlertDLQBatch,
} from "../../../worker/lib/alerts/queue";
import { matchAndNotifySubscriptions } from "../../../worker/lib/alerts/matcher";
import { sendAlertNotification } from "../../../worker/lib/alerts/notifier";
import {
  recordDelivery,
  hasDelivered,
} from "../../../worker/lib/d1/alert-deliveries";
import { getActiveSubscriptionsByFrequency } from "../../../worker/lib/d1/alert-subscriptions";
import type { Deal } from "../../../worker/types/deal";
import type { AlertDispatchMessage, Env } from "../../../worker/types";
import type { AlertSubscriptionRow } from "../../../worker/lib/d1/alert-subscriptions";

vi.mock("../../../worker/lib/alerts/notifier", () => ({
  sendAlertNotification: vi.fn(),
  formatAlertMessage: vi.fn(() => "alert message"),
}));

vi.mock("../../../worker/lib/d1/alert-deliveries", () => ({
  recordDelivery: vi.fn(),
  hasDelivered: vi.fn(),
}));

vi.mock("../../../worker/lib/d1/alert-subscriptions", () => ({
  getActiveSubscriptionsByFrequency: vi.fn(),
}));

vi.mock("../../../worker/lib/eu-ai-act-logger", () => ({
  createComplianceLogger: vi.fn(() => ({
    logOperation: complianceSpies.logOperation,
  })),
}));

// Hoisted spy bag: vi.hoisted ensures the spy exists before the hoisted
// mock factory above executes during module resolution.
const complianceSpies = vi.hoisted(() => ({ logOperation: vi.fn() }));

const sampleDeal: Deal = {
  id: "deal_1",
  code: "AWS500",
  title: "AWS Cloud Credits $500",
  description: "Get $500 in cloud credits",
  url: "https://example.com/aws",
  source: {
    url: "https://example.com",
    domain: "example.com",
    discovered_at: "2026-10-02T00:00:00Z",
    trust_score: 0.9,
  },
  reward: { type: "cash", value: 500, currency: "USD" },
  expiry: { confidence: 1.0, type: "unknown" },
  metadata: {
    status: "active",
    confidence_score: 0.9,
    normalized_at: "2026-10-02T00:00:00Z",
    category: ["cloud"],
    tags: ["aws"],
  },
};

const sampleSub: AlertSubscriptionRow = {
  id: "sub_123",
  user_id: "user_1",
  saved_query_id: "q_1",
  channel: "webhook",
  destination: "https://hooks.example.com/abc",
  threshold: 0.5,
  frequency: "instant",
  active: 1,
  created_at: 1000,
  updated_at: 1000,
  query: "cloud credits",
};

function makeEnv(overrides: Record<string, unknown> = {}): Env {
  return {
    DEALS_DB: { prepare: vi.fn() },
    ...overrides,
  } as unknown as Env;
}

function makeQueueBinding() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function makeMessage(
  overrides: Partial<AlertDispatchMessage> = {},
): AlertDispatchMessage {
  return {
    alertId: "alert_sub_123_abc123",
    subscriptionId: "sub_123",
    userId: "user_1",
    savedQueryId: "q_1",
    channel: "webhook",
    destination: "https://hooks.example.com/abc",
    query: "cloud credits",
    threshold: 0.5,
    frequency: "instant",
    deals: [sampleDeal],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasDelivered).mockResolvedValue(false);
  vi.mocked(sendAlertNotification).mockResolvedValue({
    subscriptionId: "sub_123",
    channel: "webhook",
    success: true,
  });
  vi.mocked(getActiveSubscriptionsByFrequency).mockResolvedValue([]);
});

describe("computeAlertId", () => {
  it("is deterministic and order-insensitive across deal sets", async () => {
    const a = await computeAlertId("sub_1", [sampleDeal]);
    const b = await computeAlertId("sub_1", [{ ...sampleDeal }]);
    const c = await computeAlertId("sub_1", [
      sampleDeal,
      { ...sampleDeal, id: "deal_2" },
    ]);
    const d = await computeAlertId("sub_2", [sampleDeal]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a.startsWith("alert_sub_1_")).toBe(true);
  });
});

describe("buildAlertDispatchMessage", () => {
  it("maps subscription fields and carries the deal batch", async () => {
    const message = await buildAlertDispatchMessage(
      sampleSub,
      [sampleDeal],
      "instant",
    );
    expect(message.subscriptionId).toBe("sub_123");
    expect(message.userId).toBe("user_1");
    expect(message.savedQueryId).toBe("q_1");
    expect(message.channel).toBe("webhook");
    expect(message.destination).toBe(sampleSub.destination);
    expect(message.query).toBe("cloud credits");
    expect(message.threshold).toBe(0.5);
    expect(message.frequency).toBe("instant");
    expect(message.deals).toEqual([sampleDeal]);
    expect(message.alertId).toContain("sub_123");
    // Serializable by construction: JSON round-trip preserves it.
    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });
});

describe("dispatchAlertNotification", () => {
  it("enqueues when the binding exists and skips the inline send", async () => {
    const queue = makeQueueBinding();
    const env = makeEnv({ ALERT_QUEUE: queue });
    const result = await dispatchAlertNotification(
      env,
      sampleSub,
      [sampleDeal],
      "instant",
    );
    expect(queue.send).toHaveBeenCalledTimes(1);
    const [firstCall] = queue.send.mock.calls;
    expect(firstCall?.[0]).toMatchObject({ subscriptionId: "sub_123" });
    expect(String(firstCall?.[0]?.alertId)).toContain("sub_123");
    expect(sendAlertNotification).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.queued).toBe(true);
  });

  it("falls back to the inline send without the binding", async () => {
    const env = makeEnv();
    const result = await dispatchAlertNotification(
      env,
      sampleSub,
      [sampleDeal],
      "instant",
    );
    expect(sendAlertNotification).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.queued).toBeUndefined();
  });

  it("falls back to the inline send when enqueue fails", async () => {
    const queue = { send: vi.fn().mockRejectedValue(new Error("queue down")) };
    const env = makeEnv({ ALERT_QUEUE: queue });
    const result = await dispatchAlertNotification(
      env,
      sampleSub,
      [sampleDeal],
      "instant",
    );
    expect(queue.send).toHaveBeenCalledTimes(1);
    expect(sendAlertNotification).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.queued).toBeUndefined();
  });
});

function makeBatch(
  bodies: AlertDispatchMessage[],
  queue = "deal-alerts",
): MessageBatch<AlertDispatchMessage> {
  const messages = bodies.map((body) => ({
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  return { queue, messages } as unknown as MessageBatch<AlertDispatchMessage>;
}

/** Non-cast accessor for the first mock message (tests always build >= 1). */
function firstMessage(
  batch: MessageBatch<AlertDispatchMessage>,
): (typeof batch.messages)[number] {
  const [message] = batch.messages;
  if (!message) throw new Error("test batch requires at least one message");
  return message;
}

describe("processAlertQueueBatch (consumer)", () => {
  it("sends, records the delivery, and acks on success", async () => {
    const batch = makeBatch([makeMessage()]);
    const summary = await processAlertQueueBatch(batch, makeEnv());
    expect(sendAlertNotification).toHaveBeenCalledTimes(1);
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "sent",
        alertId: "alert_sub_123_abc123",
      }),
    );
    expect(firstMessage(batch).ack).toHaveBeenCalledTimes(1);
    expect(firstMessage(batch).retry).not.toHaveBeenCalled();
    expect(summary.retried).toBe(0);
  });

  it("acks redelivered alerts as duplicates without resending", async () => {
    vi.mocked(hasDelivered).mockResolvedValue(true);
    const batch = makeBatch([makeMessage()]);
    await processAlertQueueBatch(batch, makeEnv());
    expect(sendAlertNotification).not.toHaveBeenCalled();
    expect(recordDelivery).not.toHaveBeenCalled();
    expect(firstMessage(batch).ack).toHaveBeenCalledTimes(1);
  });

  it("retries failed deliveries without writing a ledger row", async () => {
    vi.mocked(sendAlertNotification).mockResolvedValue({
      subscriptionId: "sub_123",
      channel: "webhook",
      success: false,
      error: "Webhook returned HTTP 500",
    });
    const batch = makeBatch([makeMessage()]);
    const summary = await processAlertQueueBatch(batch, makeEnv());
    expect(recordDelivery).not.toHaveBeenCalled();
    expect(firstMessage(batch).retry).toHaveBeenCalledTimes(1);
    expect(firstMessage(batch).ack).not.toHaveBeenCalled();
    expect(summary.retried).toBe(1);
  });

  it("records and acks invalid payloads as skipped", async () => {
    const batch = makeBatch([makeMessage({ channel: "sms" })]);
    await processAlertQueueBatch(batch, makeEnv());
    expect(sendAlertNotification).not.toHaveBeenCalled();
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "skipped",
        error: "invalid message payload",
      }),
    );
    expect(firstMessage(batch).ack).toHaveBeenCalledTimes(1);
  });

  it("retries when the consumer throws", async () => {
    vi.mocked(hasDelivered).mockRejectedValue(new Error("d1 down"));
    const batch = makeBatch([makeMessage()]);
    await processAlertQueueBatch(batch, makeEnv());
    expect(firstMessage(batch).retry).toHaveBeenCalledTimes(1);
  });
});

describe("processAlertDLQBatch (dead-letter consumer)", () => {
  it("records terminal failed status and acks", async () => {
    const batch = makeBatch([makeMessage()], "deal-alerts-dlq");
    await processAlertDLQBatch(batch, makeEnv());
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "failed",
        error: "delivery exhausted retries (dead letter)",
      }),
    );
    expect(firstMessage(batch).ack).toHaveBeenCalledTimes(1);
  });

  it("does not double-record when the ledger already has the alert", async () => {
    vi.mocked(hasDelivered).mockResolvedValue(true);
    const batch = makeBatch([makeMessage()], "deal-alerts-dlq");
    await processAlertDLQBatch(batch, makeEnv());
    expect(recordDelivery).not.toHaveBeenCalled();
    expect(firstMessage(batch).ack).toHaveBeenCalledTimes(1);
  });

  it("acks even when ledger recording fails", async () => {
    vi.mocked(recordDelivery).mockRejectedValue(new Error("d1 down"));
    const batch = makeBatch([makeMessage()], "deal-alerts-dlq");
    await processAlertDLQBatch(batch, makeEnv());
    expect(firstMessage(batch).ack).toHaveBeenCalledTimes(1);
  });
});

describe("matchAndNotifySubscriptions queue-first wiring", () => {
  it("enqueues matches instead of sending inline when the binding exists", async () => {
    vi.mocked(getActiveSubscriptionsByFrequency).mockResolvedValue([sampleSub]);
    const queue = makeQueueBinding();
    const env = makeEnv({ ALERT_QUEUE: queue });
    const summary = await matchAndNotifySubscriptions(
      env,
      [sampleDeal],
      "instant",
    );
    expect(queue.send).toHaveBeenCalledTimes(1);
    expect(sendAlertNotification).not.toHaveBeenCalled();
    expect(summary.notificationsSent).toBe(1);
    const [firstResult] = summary.results;
    expect(firstResult?.success).toBe(true);
  });

  it("logs queued disposition to the EU AI Act ledger", async () => {
    complianceSpies.logOperation.mockClear();
    vi.mocked(getActiveSubscriptionsByFrequency).mockResolvedValue([sampleSub]);
    const env = makeEnv({ ALERT_QUEUE: makeQueueBinding() });
    await matchAndNotifySubscriptions(env, [sampleDeal], "instant");
    expect(complianceSpies.logOperation).toHaveBeenCalledTimes(1);
    const [firstCall] = complianceSpies.logOperation.mock.calls;
    expect(firstCall?.[0]?.outputData?.result).toBe("queued");
  });

  it("still sends inline when no queue binding exists", async () => {
    vi.mocked(getActiveSubscriptionsByFrequency).mockResolvedValue([sampleSub]);
    const env = makeEnv();
    const summary = await matchAndNotifySubscriptions(
      env,
      [sampleDeal],
      "instant",
    );
    expect(sendAlertNotification).toHaveBeenCalledTimes(1);
    expect(summary.notificationsSent).toBe(1);
  });
});
