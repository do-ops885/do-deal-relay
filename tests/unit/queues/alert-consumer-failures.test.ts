import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
  MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH,
} from "../../../worker/lib/alerts/budgets";
import { handleAlertQueueBatch } from "../../../worker/queues/alert-consumer";
import { enqueueAlertBatch } from "../../../worker/lib/alerts/queue-producer";
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

const TEST_ALERT_ID = "alert-fail-1";
const TEST_SUBSCRIPTION_ID = "sub-fail-1";
const TEST_DEAL_ID = "deal-fail-1";
const TEST_USER_ID = "user-fail-1";
const TEST_SAVED_QUERY_ID = "saved-query-fail-1";
const TEST_DESTINATION = "https://example.com/hook";
const TEST_QUERY_CLOUD_CREDITS = "cloud credits";
const TEST_THRESHOLD = 0.5;
const TEST_RUN_ID = "alert-test-run-1";
const TEST_ERROR_MESSAGE = "sender boom";
const TEST_QUEUE_NAME = "alert-queue";
const TEST_DEAL_TITLE = "Get cloud credits bonus today";
const TEST_DEAL_DESCRIPTION = "Claim cloud credits for your startup";
const TEST_DEAL_CODE = "CLOUD100";
const TEST_SOURCE_URL = "https://example.com/cloud-credits";
const TEST_SOURCE_DOMAIN = "example.com";
const TEST_DEAL_URL = "https://example.com/cloud-credits";
const TEST_DISCOVERED_AT = "2026-01-01T00:00:00.000Z";
const TEST_NORMALIZED_AT = "2026-01-01T00:00:00.000Z";
const TEST_GENERATED_AT = "2026-01-01T00:00:00.000Z";
const TEST_SNAPSHOT_VERSION = "1.0.0";
const TEST_SCHEMA_VERSION = "1.0.0";
const TEST_TRACE_ID = "trace-test-1";
const TEST_SNAPSHOT_HASH = "hash-test-1";
const TEST_PREVIOUS_HASH = "prev-hash-test-1";
const TEST_CREATED_AT = 1700000000;
const TEST_UPDATED_AT = 1700000000;
const TEST_TRUST_SCORE = 0.9;
const TEST_CONFIDENCE_SCORE = 0.9;
const TEST_REWARD_VALUE = 100;
const TEST_REWARD_CURRENCY = "USD";
const TEST_CATEGORY = "cloud";
const TEST_TAG = "credits";
const TEST_BOOKMARK = "bookmark-test";
const ACTIVE_FLAG = 1;
const STATUS_FAILED = "failed";
const STATUS_SKIPPED = "skipped";
const SQL_FROM_DELIVERIES = "FROM alert_deliveries";
const SQL_FROM_SUBSCRIPTIONS = "FROM alert_subscriptions";
const SQL_INTO_DELIVERIES = "INTO alert_deliveries";

const TEST_CHANNEL: AlertSubscriptionRow["channel"] = "webhook";
const TEST_FREQUENCY: AlertSubscriptionRow["frequency"] = "instant";
const TEST_REWARD_TYPE: Deal["reward"]["type"] = "credit";
const TEST_EXPIRY_TYPE: Deal["expiry"]["type"] = "hard";
const TEST_DEAL_STATUS: Deal["metadata"]["status"] = "active";

interface MockDbState {
  sentCount: number;
  subRow: AlertSubscriptionRow | null;
  subRows: AlertSubscriptionRow[];
  capturedInserts: unknown[][];
}

function makeSubscriptionRow(): AlertSubscriptionRow {
  return {
    id: TEST_SUBSCRIPTION_ID,
    user_id: TEST_USER_ID,
    saved_query_id: TEST_SAVED_QUERY_ID,
    channel: TEST_CHANNEL,
    destination: TEST_DESTINATION,
    threshold: TEST_THRESHOLD,
    frequency: TEST_FREQUENCY,
    active: ACTIVE_FLAG,
    created_at: TEST_CREATED_AT,
    updated_at: TEST_UPDATED_AT,
    query: TEST_QUERY_CLOUD_CREDITS,
  };
}

function makeCloudCreditsDeal(): Deal {
  return {
    id: TEST_DEAL_ID,
    source: {
      url: TEST_SOURCE_URL,
      domain: TEST_SOURCE_DOMAIN,
      discovered_at: TEST_DISCOVERED_AT,
      trust_score: TEST_TRUST_SCORE,
    },
    title: TEST_DEAL_TITLE,
    description: TEST_DEAL_DESCRIPTION,
    code: TEST_DEAL_CODE,
    url: TEST_DEAL_URL,
    reward: {
      type: TEST_REWARD_TYPE,
      value: TEST_REWARD_VALUE,
      currency: TEST_REWARD_CURRENCY,
    },
    expiry: {
      confidence: TEST_CONFIDENCE_SCORE,
      type: TEST_EXPIRY_TYPE,
    },
    metadata: {
      category: [TEST_CATEGORY],
      tags: [TEST_TAG],
      normalized_at: TEST_NORMALIZED_AT,
      confidence_score: TEST_CONFIDENCE_SCORE,
      status: TEST_DEAL_STATUS,
    },
  };
}

function makeSnapshot(deals: Deal[]): Snapshot {
  return {
    version: TEST_SNAPSHOT_VERSION,
    generated_at: TEST_GENERATED_AT,
    run_id: TEST_RUN_ID,
    trace_id: TEST_TRACE_ID,
    snapshot_hash: TEST_SNAPSHOT_HASH,
    previous_hash: TEST_PREVIOUS_HASH,
    schema_version: TEST_SCHEMA_VERSION,
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

function createMockDb(state: MockDbState) {
  function makePrepare(sql: string) {
    const matchesDeliveries = sql.includes(SQL_FROM_DELIVERIES);
    const matchesSubscriptions = sql.includes(SQL_FROM_SUBSCRIPTIONS);
    const isInsertDeliveries = sql.includes(SQL_INTO_DELIVERIES);
    const bound = (...params: unknown[]) => ({
      first: async (): Promise<unknown> => {
        if (matchesDeliveries) {
          return { cnt: state.sentCount };
        }
        if (matchesSubscriptions) {
          return state.subRow;
        }
        return null;
      },
      run: async (): Promise<{
        success: boolean;
        results?: unknown[];
        meta?: Record<string, unknown>;
      }> => {
        if (isInsertDeliveries) {
          state.capturedInserts.push(params);
          return { success: true, meta: { changes: 1 } };
        }
        if (matchesSubscriptions) {
          return {
            success: true,
            results: state.subRows,
            meta: {
              changes: 0,
              rows_read: state.subRows.length,
              rows_written: 0,
            },
          };
        }
        return { success: true, meta: { changes: 1 } };
      },
      all: async (): Promise<{
        success: boolean;
        results: unknown[];
      }> => {
        if (matchesSubscriptions) {
          return { success: true, results: state.subRows };
        }
        return { success: true, results: [] };
      },
    });
    return {
      bind: bound,
      first: async (): Promise<unknown> => {
        if (matchesDeliveries) {
          return { cnt: state.sentCount };
        }
        if (matchesSubscriptions) {
          return state.subRow;
        }
        return null;
      },
      run: async (): Promise<{
        success: boolean;
        results?: unknown[];
        meta?: Record<string, unknown>;
      }> => {
        if (matchesSubscriptions) {
          return {
            success: true,
            results: state.subRows,
            meta: {
              changes: 0,
              rows_read: state.subRows.length,
              rows_written: 0,
            },
          };
        }
        return { success: true, meta: { changes: 1 } };
      },
      all: async (): Promise<{
        success: boolean;
        results: unknown[];
      }> => {
        if (matchesSubscriptions) {
          return { success: true, results: state.subRows };
        }
        return { success: true, results: [] };
      },
    };
  }

  return {
    prepare: (sql: string) => makePrepare(sql),
    withSession: () => ({
      prepare: (sql: string) => makePrepare(sql),
      getBookmark: () => TEST_BOOKMARK,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("alert consumer failures", () => {
  it("records failed status and retries when send reports failure", async () => {
    const state: MockDbState = {
      sentCount: 0,
      subRow: makeSubscriptionRow(),
      subRows: [],
      capturedInserts: [],
    };
    const deal = makeCloudCreditsDeal();
    vi.mocked(getProductionSnapshot).mockResolvedValue(makeSnapshot([deal]));
    vi.mocked(sendAlertNotification).mockResolvedValue({
      subscriptionId: TEST_SUBSCRIPTION_ID,
      channel: TEST_CHANNEL,
      success: false,
      error: TEST_ERROR_MESSAGE,
    });

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      messages: [
        {
          body: {
            alertId: TEST_ALERT_ID,
            subscriptionId: TEST_SUBSCRIPTION_ID,
            dealIds: [TEST_DEAL_ID],
            channel: TEST_CHANNEL,
            frequency: TEST_FREQUENCY,
          },
          ack,
          retry,
        },
      ],
      queue: TEST_QUEUE_NAME,
      retryAll: vi.fn(),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[0];
    const env = {
      DEALS_DB: createMockDb(state),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[1];

    await handleAlertQueueBatch(batch, env);

    expect(retry).toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(sendAlertNotification).toHaveBeenCalledTimes(1);
    expect(state.capturedInserts).toHaveLength(1);
    const firstInsert = state.capturedInserts[0];
    expect(firstInsert).toBeDefined();
    expect(firstInsert?.[0]).toBe(TEST_ALERT_ID);
    expect(firstInsert?.[1]).toBe(TEST_SUBSCRIPTION_ID);
    expect(firstInsert?.[4]).toBe(STATUS_FAILED);
  });

  it("retries without ack when the sender throws", async () => {
    const state: MockDbState = {
      sentCount: 0,
      subRow: makeSubscriptionRow(),
      subRows: [],
      capturedInserts: [],
    };
    const deal = makeCloudCreditsDeal();
    vi.mocked(getProductionSnapshot).mockResolvedValue(makeSnapshot([deal]));
    vi.mocked(sendAlertNotification).mockRejectedValue(
      new Error(TEST_ERROR_MESSAGE),
    );

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      messages: [
        {
          body: {
            alertId: TEST_ALERT_ID,
            subscriptionId: TEST_SUBSCRIPTION_ID,
            dealIds: [TEST_DEAL_ID],
            channel: TEST_CHANNEL,
            frequency: TEST_FREQUENCY,
          },
          ack,
          retry,
        },
      ],
      queue: TEST_QUEUE_NAME,
      retryAll: vi.fn(),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[0];
    const env = {
      DEALS_DB: createMockDb(state),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[1];

    await handleAlertQueueBatch(batch, env);

    expect(retry).toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(state.capturedInserts).toHaveLength(0);
  });

  it("records skipped and acks when deals resolve to empty", async () => {
    const state: MockDbState = {
      sentCount: 0,
      subRow: makeSubscriptionRow(),
      subRows: [],
      capturedInserts: [],
    };
    vi.mocked(getProductionSnapshot).mockResolvedValue(makeSnapshot([]));
    vi.mocked(sendAlertNotification).mockResolvedValue({
      subscriptionId: TEST_SUBSCRIPTION_ID,
      channel: TEST_CHANNEL,
      success: true,
    });

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      messages: [
        {
          body: {
            alertId: TEST_ALERT_ID,
            subscriptionId: TEST_SUBSCRIPTION_ID,
            dealIds: [TEST_DEAL_ID],
            channel: TEST_CHANNEL,
            frequency: TEST_FREQUENCY,
          },
          ack,
          retry,
        },
      ],
      queue: TEST_QUEUE_NAME,
      retryAll: vi.fn(),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[0];
    const env = {
      DEALS_DB: createMockDb(state),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[1];

    await handleAlertQueueBatch(batch, env);

    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(sendAlertNotification).not.toHaveBeenCalled();
    expect(state.capturedInserts).toHaveLength(1);
    const firstInsert = state.capturedInserts[0];
    expect(firstInsert?.[4]).toBe(STATUS_SKIPPED);
  });

  it("acks without send when the subscription is unknown", async () => {
    const state: MockDbState = {
      sentCount: 0,
      subRow: null,
      subRows: [],
      capturedInserts: [],
    };
    const deal = makeCloudCreditsDeal();
    vi.mocked(getProductionSnapshot).mockResolvedValue(makeSnapshot([deal]));
    vi.mocked(sendAlertNotification).mockResolvedValue({
      subscriptionId: TEST_SUBSCRIPTION_ID,
      channel: TEST_CHANNEL,
      success: true,
    });

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      messages: [
        {
          body: {
            alertId: TEST_ALERT_ID,
            subscriptionId: TEST_SUBSCRIPTION_ID,
            dealIds: [TEST_DEAL_ID],
            channel: TEST_CHANNEL,
            frequency: TEST_FREQUENCY,
          },
          ack,
          retry,
        },
      ],
      queue: TEST_QUEUE_NAME,
      retryAll: vi.fn(),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[0];
    const env = {
      DEALS_DB: createMockDb(state),
    } as unknown as Parameters<typeof handleAlertQueueBatch>[1];

    await handleAlertQueueBatch(batch, env);

    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(sendAlertNotification).not.toHaveBeenCalled();
    expect(state.capturedInserts).toHaveLength(0);
  });
});

describe("alert producer ids-only enqueue", () => {
  it("enqueues one ids-only message for a phrase match", async () => {
    const subRow = makeSubscriptionRow();
    const state: MockDbState = {
      sentCount: 0,
      subRow,
      subRows: [subRow],
      capturedInserts: [],
    };
    const deal = makeCloudCreditsDeal();
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const env = {
      DEALS_DB: createMockDb(state),
      ALERT_QUEUE: { sendBatch },
    } as unknown as Parameters<typeof enqueueAlertBatch>[0];

    const result = await enqueueAlertBatch(
      env,
      [deal],
      TEST_FREQUENCY,
      TEST_RUN_ID,
    );

    expect(result.enqueued).toBe(1);
    expect(result.fallbackInline).toBe(false);
    expect(result.dropped).toBe(0);
    expect(result.enqueued).toBeLessThanOrEqual(
      MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
    );
    expect(sendBatch).toHaveBeenCalledTimes(1);
    const firstCall = sendBatch.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sentMessages = firstCall?.[0] as unknown as Array<{
      body: { dealIds: string[] };
    }>;
    expect(sentMessages).toHaveLength(1);
    const sentBody = sentMessages[0]?.body;
    expect(sentBody).toBeDefined();
    expect(sentBody?.dealIds).toEqual([TEST_DEAL_ID]);
    expect(sentBody?.dealIds.length).toBeLessThanOrEqual(
      MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH,
    );
    expect(sentBody).not.toHaveProperty("title");
    expect(sentBody).not.toHaveProperty("description");
  });
});
