// Threshold evaluation, snapshot collection, and alert emission for the
// webhook queue health surface (#1060).
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collectWebhookQueueHealth,
  evaluateWebhookQueueHealth,
  reportWebhookQueueAlerts,
  WEBHOOK_QUEUE_THRESHOLDS,
  formatWebhookQueuePrometheus,
} from "../../../worker/lib/webhook/health";
import type { Env } from "../../../worker/types";

const { recordMetricMock, warnMock } = vi.hoisted(() => ({
  recordMetricMock: vi.fn().mockResolvedValue(undefined),
  warnMock: vi.fn(),
}));

vi.mock("../../../worker/lib/webhook/metrics", () => ({
  WEBHOOK_METRICS: { QUEUE_ALERT_TOTAL: "webhook_queue_alert_total" },
  recordWebhookMetric: recordMetricMock,
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), warn: warnMock, error: vi.fn() },
  emitConsole: vi.fn(),
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
    list: vi.fn(async ({ prefix }: { prefix?: string } = {}) => ({
      keys: [...storage.keys()]
        .filter((key) => !prefix || key.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: undefined,
    })),
    storage,
  };
}

type FakeKv = ReturnType<typeof createKv>;

beforeEach(() => {
  vi.clearAllMocks();
});

function daysAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

describe("evaluateWebhookQueueHealth", () => {
  it("reports ok with no evidence", () => {
    const health = evaluateWebhookQueueHealth({
      dlqDepth: 0,
      sampledDeliveries: 0,
      retriedDeliveries: 0,
      oldestPendingAgeMs: null,
    });

    expect(health.status).toBe("ok");
    expect(health.alerts).toEqual([]);
    expect(health.retry_rate).toBe(0);
  });

  it("treats any dead-lettered delivery as critical", () => {
    const health = evaluateWebhookQueueHealth({
      dlqDepth: 2,
      sampledDeliveries: 40,
      retriedDeliveries: 0,
      oldestPendingAgeMs: null,
    });

    expect(health.status).toBe("critical");
    expect(health.alerts.map((a) => a.kind)).toEqual(["dlq_depth"]);
  });

  it("alerts on a retry rate above the threshold once the sample is large enough", () => {
    const health = evaluateWebhookQueueHealth({
      dlqDepth: 0,
      sampledDeliveries: WEBHOOK_QUEUE_THRESHOLDS.MIN_SAMPLE_SIZE,
      retriedDeliveries: WEBHOOK_QUEUE_THRESHOLDS.MIN_SAMPLE_SIZE,
      oldestPendingAgeMs: null,
    });

    expect(health.status).toBe("degraded");
    expect(health.alerts.map((a) => a.kind)).toEqual(["retry_rate"]);
    expect(health.retry_rate).toBe(1);
  });

  it("ignores retry rates from samples too small to be meaningful", () => {
    const health = evaluateWebhookQueueHealth({
      dlqDepth: 0,
      sampledDeliveries: 1,
      retriedDeliveries: 1,
      oldestPendingAgeMs: null,
    });

    expect(health.status).toBe("ok");
    expect(health.alerts).toEqual([]);
  });

  it("alerts when a pending delivery exceeds the age budget", () => {
    const health = evaluateWebhookQueueHealth({
      dlqDepth: 0,
      sampledDeliveries: 1,
      retriedDeliveries: 0,
      oldestPendingAgeMs: WEBHOOK_QUEUE_THRESHOLDS.OLDEST_PENDING_AGE_MS,
    });

    expect(health.status).toBe("degraded");
    expect(health.alerts.map((a) => a.kind)).toEqual(["pending_age"]);
  });
});

describe("collectWebhookQueueHealth", () => {
  let kv: FakeKv;

  beforeEach(() => {
    vi.clearAllMocks();
    kv = createKv();
  });

  it("scores a snapshot from persisted delivery and DLQ state", async () => {
    for (let i = 0; i < 6; i++) {
      kv.storage.set(
        `webhook_delivery:evt_${i}:sub_1`,
        JSON.stringify({
          event_id: `evt_${i}`,
          subscription_id: "sub_1",
          status: i === 0 ? "pending" : "delivered",
          attempts: [
            { attempt_number: 1, timestamp: daysAgo(3) },
            ...(i < 2 ? [{ attempt_number: 2, timestamp: daysAgo(2) }] : []),
          ],
          created_at: daysAgo(i === 0 ? 30 : 5),
        }),
      );
    }
    kv.storage.set(
      "webhook_dlq:evt_9:sub_1",
      JSON.stringify({
        delivery: { event_id: "evt_9", subscription_id: "sub_1" },
        event: { id: "evt_9", type: "referral.created" },
        enqueued_at: daysAgo(5),
        retryable: true,
      }),
    );

    const env = { DEALS_STAGING: kv } as unknown as Env;
    const health = await collectWebhookQueueHealth(env);

    expect(health.sampled_deliveries).toBe(6);
    expect(health.retried_deliveries).toBe(2);
    expect(health.retry_rate).toBe(0.333);
    expect(health.dlq_depth).toBe(1);
    expect(health.status).toBe("critical");
    expect(health.oldest_pending_age_ms).toBeGreaterThanOrEqual(
      WEBHOOK_QUEUE_THRESHOLDS.OLDEST_PENDING_AGE_MS,
    );
  });

  it("excludes stale retries from the retry-rate sample", async () => {
    for (let i = 0; i < 6; i++) {
      kv.storage.set(
        `webhook_delivery:evt_old_${i}:sub_1`,
        JSON.stringify({
          event_id: `evt_old_${i}`,
          subscription_id: "sub_1",
          status: "delivered",
          attempts: [
            { attempt_number: 1, timestamp: daysAgo(180) },
            { attempt_number: 2, timestamp: daysAgo(150) },
          ],
          created_at: daysAgo(200),
        }),
      );
    }

    const health = await collectWebhookQueueHealth({
      DEALS_STAGING: kv,
    } as unknown as Env);

    expect(health.sampled_deliveries).toBe(0);
    expect(health.retried_deliveries).toBe(0);
    expect(health.retry_rate).toBe(0);
    expect(health.status).toBe("ok");
  });

  it("stays ok when no KV binding is present", async () => {
    const health = await collectWebhookQueueHealth({} as unknown as Env);

    expect(health.status).toBe("ok");
    expect(health.sampled_deliveries).toBe(0);
  });
});

describe("reportWebhookQueueAlerts", () => {
  it("logs and counts one alert per breached threshold", async () => {
    const health = evaluateWebhookQueueHealth({
      dlqDepth: 1,
      sampledDeliveries: 10,
      retriedDeliveries: 5,
      oldestPendingAgeMs: null,
    });

    await reportWebhookQueueAlerts({} as unknown as Env, health);

    expect(warnMock).toHaveBeenCalledTimes(2);
    expect(recordMetricMock).toHaveBeenCalledTimes(2);
    expect(recordMetricMock).toHaveBeenCalledWith(
      expect.anything(),
      "webhook_queue_alert_total",
      1,
      { kind: "dlq_depth" },
    );
  });

  it("emits nothing when the queue is healthy", async () => {
    await reportWebhookQueueAlerts(
      {} as unknown as Env,
      evaluateWebhookQueueHealth({
        dlqDepth: 0,
        sampledDeliveries: 0,
        retriedDeliveries: 0,
        oldestPendingAgeMs: null,
      }),
    );

    expect(warnMock).not.toHaveBeenCalled();
    expect(recordMetricMock).not.toHaveBeenCalled();
  });
});

describe("formatWebhookQueuePrometheus", () => {
  it("exports gauges, converting pending age to seconds", () => {
    const body = formatWebhookQueuePrometheus(
      evaluateWebhookQueueHealth({
        dlqDepth: 3,
        sampledDeliveries: 0,
        retriedDeliveries: 0,
        oldestPendingAgeMs: WEBHOOK_QUEUE_THRESHOLDS.OLDEST_PENDING_AGE_MS,
      }),
    );

    expect(body).toContain("webhook_queue_dlq_depth 3");
    expect(body).toContain("webhook_queue_oldest_pending_seconds 900");
    expect(body).toContain("webhook_queue_alerts_active 2");
  });
});
