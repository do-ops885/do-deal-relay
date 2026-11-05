import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAlertQueueBatch } from "../../../worker/queues/alert-consumer";
import { sendAlertNotification } from "../../../worker/lib/alerts/notifier";
import { getProductionSnapshot } from "../../../worker/lib/storage";
import type { Deal, Snapshot } from "../../../worker/types/deal";
import type { AlertSubscriptionRow } from "../../../worker/lib/d1/alert-subscriptions";

vi.mock("../../../worker/lib/alerts/notifier", () => ({
  sendAlertNotification: vi.fn(),
}));

vi.mock("../../../worker/lib/storage", () => ({
  getProductionSnapshot: vi.fn(),
}));

vi.mock("../../../worker/lib/eu-ai-act-logger", () => ({
  createComplianceLogger: () => ({
    logOperation: vi.fn().mockResolvedValue(undefined),
  }),
}));

const ALERT_ID = "alert-retry-1";
const SUBSCRIPTION_ID = "sub-retry-1";
const DEAL_ID = "deal-retry-1";
const CHANNEL = "webhook";
const FREQUENCY = "instant";

function makeSubscription(): AlertSubscriptionRow {
  return {
    id: SUBSCRIPTION_ID,
    user_id: "user-retry-1",
    saved_query_id: "query-retry-1",
    channel: CHANNEL,
    destination: "https://example.com/hook",
    threshold: 0.5,
    frequency: FREQUENCY,
    active: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    query: "cloud credits",
  };
}

function makeDeal(): Deal {
  return {
    id: DEAL_ID,
    source: {
      url: "https://example.com/deal",
      domain: "example.com",
      discovered_at: "2026-01-01T00:00:00.000Z",
      trust_score: 0.9,
    },
    title: "Cloud credits",
    description: "Claim cloud credits",
    code: "CLOUD100",
    url: "https://example.com/deal",
    reward: { type: "credit", value: 100, currency: "USD" },
    expiry: { confidence: 0.9, type: "hard" },
    metadata: {
      category: ["cloud"],
      tags: ["credits"],
      normalized_at: "2026-01-01T00:00:00.000Z",
      confidence_score: 0.9,
      status: "active",
    },
  };
}

function makeSnapshot(deals: Deal[]): Snapshot {
  return {
    version: "1.0.0",
    generated_at: "2026-01-01T00:00:00.000Z",
    run_id: "run-retry-1",
    trace_id: "trace-retry-1",
    snapshot_hash: "hash-retry-1",
    previous_hash: "prev-retry-1",
    schema_version: "1.0.0",
    stats: {
      total: deals.length,
      active: deals.length,
      quarantined: 0,
      rejected: 0,
      duplicates: 0,
    },
    deals,
  };
}

interface DeliveryState {
  status: string | null;
  error: string | null;
  attempts: number;
  writes: number;
}

function createStatefulDb(
  state: DeliveryState,
  sub: AlertSubscriptionRow | null,
) {
  function prepare(sql: string) {
    const isSentLookup =
      sql.includes("FROM alert_deliveries") && sql.includes("status = 'sent'");
    const isSubscriptionLookup = sql.includes("FROM alert_subscriptions");
    const isDeliveryWrite = sql.includes("INTO alert_deliveries");

    const stmt = {
      first: async (): Promise<unknown> => {
        if (isSentLookup) {
          return { cnt: state.status === "sent" ? 1 : 0 };
        }
        if (isSubscriptionLookup) return sub;
        return null;
      },
      run: async () => {
        if (isDeliveryWrite) {
          const params = (stmt as unknown as { params?: unknown[] }).params;
          const nextStatus = params?.[4] as string | undefined;
          if (nextStatus !== undefined && state.status !== "sent") {
            state.status = nextStatus;
            state.error = (params?.[5] as string | null) ?? null;
            state.attempts += 1;
          }
          state.writes += 1;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
      all: async () => ({ success: true, results: [] }),
    };

    return {
      bind: (...params: unknown[]) => {
        (stmt as unknown as { params?: unknown[] }).params = params;
        return stmt;
      },
      ...stmt,
    };
  }

  return {
    prepare,
    withSession: () => ({ prepare, getBookmark: () => "bookmark" }),
  };
}

function makeBatch() {
  const ack = vi.fn();
  const retry = vi.fn();
  const batch = {
    messages: [
      {
        body: {
          alertId: ALERT_ID,
          subscriptionId: SUBSCRIPTION_ID,
          dealIds: [DEAL_ID],
          channel: CHANNEL,
          frequency: FREQUENCY,
        },
        ack,
        retry,
      },
    ],
    queue: "alert-queue",
    retryAll: vi.fn(),
  } as unknown as Parameters<typeof handleAlertQueueBatch>[0];
  return { batch, ack, retry };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProductionSnapshot).mockResolvedValue(
    makeSnapshot([makeDeal()]),
  );
});

describe("alert consumer delivery state transitions", () => {
  it("upgrades failed to sent on retry and suppresses the following duplicate", async () => {
    const state: DeliveryState = {
      status: null,
      error: null,
      attempts: 0,
      writes: 0,
    };
    const env = {
      DEALS_DB: createStatefulDb(state, makeSubscription()),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[1];

    vi.mocked(sendAlertNotification).mockResolvedValueOnce({
      subscriptionId: SUBSCRIPTION_ID,
      channel: CHANNEL,
      success: false,
      error: "temporary failure",
    });

    const first = makeBatch();
    await handleAlertQueueBatch(first.batch, env);
    expect(first.retry).toHaveBeenCalled();
    expect(first.ack).not.toHaveBeenCalled();
    expect(state.status).toBe("failed");

    vi.mocked(sendAlertNotification).mockResolvedValueOnce({
      subscriptionId: SUBSCRIPTION_ID,
      channel: CHANNEL,
      success: true,
    });

    const second = makeBatch();
    await handleAlertQueueBatch(second.batch, env);
    expect(second.ack).toHaveBeenCalled();
    expect(second.retry).not.toHaveBeenCalled();
    expect(state.status).toBe("sent");
    expect(state.error).toBeNull();
    expect(sendAlertNotification).toHaveBeenCalledTimes(2);

    const third = makeBatch();
    await handleAlertQueueBatch(third.batch, env);
    expect(third.ack).toHaveBeenCalled();
    expect(third.retry).not.toHaveBeenCalled();
    expect(sendAlertNotification).toHaveBeenCalledTimes(2);
    expect(state.writes).toBe(2);
  });

  it("keeps sent terminal when a stale failure is recorded later", async () => {
    const state: DeliveryState = {
      status: "sent",
      error: null,
      attempts: 1,
      writes: 0,
    };
    const env = {
      DEALS_DB: createStatefulDb(state, makeSubscription()),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[1];

    const { batch, ack } = makeBatch();
    await handleAlertQueueBatch(batch, env);

    expect(ack).toHaveBeenCalled();
    expect(sendAlertNotification).not.toHaveBeenCalled();
    expect(state.status).toBe("sent");
  });
});
