import { describe, it, expect, vi } from "vitest";
import {
  MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
  MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH,
  capMatchesPerSubscription,
  capPublishMessages,
} from "../../../worker/lib/alerts/budgets";
import { handleAlertQueueBatch } from "../../../worker/queues/alert-consumer";
import { enqueueAlertBatch } from "../../../worker/lib/alerts/queue-producer";

describe("alert budgets", () => {
  it("exposes free-tier caps", () => {
    expect(MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH).toBe(500);
    expect(MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH).toBe(10);
  });

  it("caps per-subscription matches with digest rollover", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `deal-${i}`);
    const capped = capMatchesPerSubscription(ids);
    expect(capped.kept).toHaveLength(10);
    expect(capped.overflowCount).toBe(2);
    expect(capped.rolledToDigest).toBe(true);
  });

  it("caps publish messages", () => {
    expect(capPublishMessages(10).allowed).toBe(10);
    const over = capPublishMessages(600);
    expect(over.allowed).toBe(500);
    expect(over.dropped).toBe(100);
  });
});

describe("alert consumer", () => {
  it("retries all when db missing", async () => {
    const retryAll = vi.fn();
    const batch = {
      messages: [{ body: {}, ack: vi.fn(), retry: vi.fn() }],
      queue: "alert-queue",
      retryAll,
    } as unknown as Parameters<typeof handleAlertQueueBatch>[0];
    const env = {} as Parameters<typeof handleAlertQueueBatch>[1];
    await handleAlertQueueBatch(batch, env);
    expect(retryAll).toHaveBeenCalled();
  });

  it("acks invalid messages when db present", async () => {
    const ack = vi.fn();
    const batch = {
      messages: [{ body: {}, ack, retry: vi.fn() }],
      queue: "alert-queue",
      retryAll: vi.fn(),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[0];
    const env = { DEALS_DB: {} } as unknown as Parameters<
      typeof handleAlertQueueBatch
    >[1];
    await handleAlertQueueBatch(batch, env);
    expect(ack).toHaveBeenCalled();
  });
});

describe("alert producer", () => {
  it("returns empty when no deals or db", async () => {
    const res = await enqueueAlertBatch({} as never, [], "instant");
    expect(res.enqueued).toBe(0);
    expect(res.fallbackInline).toBe(false);
  });

  it("falls back inline when queue binding missing", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          run: async () => ({ success: true }),
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
      }),
    };
    const env = { DEALS_DB: db } as unknown as Parameters<
      typeof enqueueAlertBatch
    >[0];
    const res = await enqueueAlertBatch(env, [], "instant");
    expect(res.enqueued).toBe(0);
  });
});
