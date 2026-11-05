import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../worker/lib/alerts/matcher", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/lib/alerts/matcher")>();
  return {
    ...actual,
    matchAndNotifySubscriptions: vi.fn(),
  };
});

import { enqueueAlertBatch } from "../../../worker/lib/alerts/queue-producer";
import { matchAndNotifySubscriptions } from "../../../worker/lib/alerts/matcher";
import type { Deal } from "../../../worker/types/deal";
import type { AlertSubscriptionRow } from "../../../worker/lib/d1/alert-subscriptions";

const RUN_ID = "run-partial-1";

function makeDeal(): Deal {
  return {
    id: "deal-partial-1",
    source: {
      url: "https://example.com/deal",
      domain: "example.com",
      discovered_at: "2026-01-01T00:00:00.000Z",
      trust_score: 0.9,
    },
    title: "Cloud credits bonus",
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

function makeSubscriptions(count: number): AlertSubscriptionRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sub-${i}`,
    user_id: `user-${i}`,
    saved_query_id: `query-${i}`,
    channel: "webhook",
    destination: "https://example.com/hook",
    threshold: 0.5,
    frequency: "instant",
    active: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    query: "cloud credits",
  }));
}

function createEnv(
  subs: AlertSubscriptionRow[],
  sendBatch: ReturnType<typeof vi.fn>,
) {
  const statement = {
    run: async () => ({
      success: true,
      results: subs,
      meta: { changes: 0, rows_read: subs.length, rows_written: 0 },
    }),
    first: async () => null,
    all: async () => ({ success: true, results: subs }),
  };
  const db = {
    prepare: () => ({ bind: () => statement, ...statement }),
    withSession: () => ({
      prepare: () => ({ bind: () => statement, ...statement }),
      getBookmark: () => "bookmark",
    }),
  };
  return {
    DEALS_DB: db,
    ALERT_QUEUE: { sendBatch },
  } as unknown as Parameters<typeof enqueueAlertBatch>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(matchAndNotifySubscriptions).mockResolvedValue({
    subscriptionsProcessed: 0,
    notificationsSent: 0,
    results: [],
  });
});

describe("enqueueAlertBatch partial enqueue safety", () => {
  it("never inline-sends subscriptions accepted before a later chunk fails", async () => {
    const sendBatch = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("queue unavailable"));
    const subs = makeSubscriptions(201);
    const env = createEnv(subs, sendBatch);

    const result = await enqueueAlertBatch(
      env,
      [makeDeal()],
      "instant",
      RUN_ID,
    );

    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(result.enqueued).toBe(100);
    expect(result.ambiguous).toBe(100);
    expect(result.fallbackInline).toBe(true);

    expect(matchAndNotifySubscriptions).toHaveBeenCalledTimes(1);
    const [, , , options] = vi.mocked(matchAndNotifySubscriptions).mock
      .calls[0]!;
    const ids = (options as { onlySubscriptionIds: Set<string> })
      .onlySubscriptionIds;
    expect(ids.size).toBe(1);
    expect(ids.has("sub-200")).toBe(true);
    expect(ids.has("sub-0")).toBe(false);
  });

  it("does not inline an ambiguous failing chunk (no double-send)", async () => {
    const sendBatch = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("accepted remotely but timed out"));
    const subs = makeSubscriptions(150);
    const env = createEnv(subs, sendBatch);

    const result = await enqueueAlertBatch(
      env,
      [makeDeal()],
      "instant",
      RUN_ID,
    );

    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(result.enqueued).toBe(100);
    expect(result.ambiguous).toBe(50);
    expect(result.fallbackInline).toBe(false);
    expect(matchAndNotifySubscriptions).not.toHaveBeenCalled();
  });

  it("uses stable alert ids across chunked sends", async () => {
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const subs = makeSubscriptions(101);
    const env = createEnv(subs, sendBatch);

    await enqueueAlertBatch(env, [makeDeal()], "instant", RUN_ID);

    expect(sendBatch).toHaveBeenCalledTimes(2);
    const firstChunk = sendBatch.mock.calls[0]?.[0] as Array<{
      body: { alertId: string; subscriptionId: string };
    }>;
    const secondChunk = sendBatch.mock.calls[1]?.[0] as Array<{
      body: { alertId: string; subscriptionId: string };
    }>;
    expect(firstChunk[0]?.body.alertId).toBe(`${RUN_ID}-sub-0`);
    expect(secondChunk[0]?.body.alertId).toBe(`${RUN_ID}-sub-100`);
  });
});
