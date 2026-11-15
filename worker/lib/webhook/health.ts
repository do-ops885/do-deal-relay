// ============================================================================
// Webhook Queue Health - thresholds, alerts, and admin snapshot
// ----------------------------------------------------------------------------
// The queue consumer emits raw metrics (#1045). This module turns them and the
// persisted delivery/DLQ state into actionable health: a bounded KV sample is
// scored against explicit thresholds, alerts are logged and counted, and the
// snapshot is exposed on the admin metrics surface.
// ============================================================================

import type { Env } from "../../types";
import type { WebhookDelivery } from "./types";
import { getWebhookKV } from "./types";
import { getDeadLetterQueue } from "./dlq";
import { listAllKvKeys } from "../kv-pagination";
import { fetchInBatches } from "../utils";
import { logger } from "../global-logger";
import { toError } from "../sanitize-error";
import { recordWebhookMetric, WEBHOOK_METRICS } from "./metrics";

const DELIVERY_PREFIX = "webhook_delivery:";

/** Minimum sampling window, in milliseconds, for the pending-age alert. */
const MINUTE_MS = 60 * 1000;

/**
 * Explicit limits for queue alerting. A dead-lettered delivery is always
 * actionable; a retry rate only alerts once the sample is large enough to mean
 * something, so a single retried message cannot page anyone.
 */
export const WEBHOOK_QUEUE_THRESHOLDS = {
  DLQ_DEPTH: 1,
  RETRY_RATE: 0.2,
  OLDEST_PENDING_AGE_MS: 15 * MINUTE_MS,
  RETRY_RATE_WINDOW_MS: 30 * MINUTE_MS,
  MIN_SAMPLE_SIZE: 5,
  SAMPLE_LIMIT: 200,
} as const;

export type WebhookQueueAlertKind = "dlq_depth" | "retry_rate" | "pending_age";

export interface WebhookQueueAlert {
  kind: WebhookQueueAlertKind;
  value: number;
  threshold: number;
  detail: string;
}

export interface WebhookQueueHealthInput {
  dlqDepth: number;
  sampledDeliveries: number;
  retriedDeliveries: number;
  oldestPendingAgeMs: number | null;
}

export interface WebhookQueueHealth {
  status: "ok" | "degraded" | "critical";
  dlq_depth: number;
  sampled_deliveries: number;
  retried_deliveries: number;
  retry_rate: number;
  oldest_pending_age_ms: number | null;
  alerts: WebhookQueueAlert[];
  evaluated_at: string;
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Scores a queue snapshot against the thresholds. Pure and total: every input
 * produces a health object, and an alert is only raised from real evidence
 * (empty DLQ and small samples never alert).
 */
export function evaluateWebhookQueueHealth(
  input: WebhookQueueHealthInput,
  now: number = Date.now(),
): WebhookQueueHealth {
  const alerts: WebhookQueueAlert[] = [];
  const sampleLargeEnough =
    input.sampledDeliveries >= WEBHOOK_QUEUE_THRESHOLDS.MIN_SAMPLE_SIZE;
  const retryRate =
    input.sampledDeliveries > 0
      ? roundRate(input.retriedDeliveries / input.sampledDeliveries)
      : 0;

  if (input.dlqDepth >= WEBHOOK_QUEUE_THRESHOLDS.DLQ_DEPTH) {
    alerts.push({
      kind: "dlq_depth",
      value: input.dlqDepth,
      threshold: WEBHOOK_QUEUE_THRESHOLDS.DLQ_DEPTH,
      detail: `${input.dlqDepth} dead-lettered delivery(s) awaiting replay`,
    });
  }

  if (sampleLargeEnough && retryRate > WEBHOOK_QUEUE_THRESHOLDS.RETRY_RATE) {
    alerts.push({
      kind: "retry_rate",
      value: retryRate,
      threshold: WEBHOOK_QUEUE_THRESHOLDS.RETRY_RATE,
      detail: `${input.retriedDeliveries}/${input.sampledDeliveries} sampled deliveries retried`,
    });
  }

  if (
    input.oldestPendingAgeMs !== null &&
    input.oldestPendingAgeMs >= WEBHOOK_QUEUE_THRESHOLDS.OLDEST_PENDING_AGE_MS
  ) {
    alerts.push({
      kind: "pending_age",
      value: input.oldestPendingAgeMs,
      threshold: WEBHOOK_QUEUE_THRESHOLDS.OLDEST_PENDING_AGE_MS,
      detail: "a pending delivery has waited longer than the age budget",
    });
  }

  const status: WebhookQueueHealth["status"] = alerts.some(
    (alert) => alert.kind === "dlq_depth",
  )
    ? "critical"
    : alerts.length > 0
      ? "degraded"
      : "ok";

  return {
    status,
    dlq_depth: input.dlqDepth,
    sampled_deliveries: input.sampledDeliveries,
    retried_deliveries: input.retriedDeliveries,
    retry_rate: retryRate,
    oldest_pending_age_ms: input.oldestPendingAgeMs,
    alerts,
    evaluated_at: new Date(now).toISOString(),
  };
}

/**
 * Samples delivery records. The retry-rate sample is windowed to the last
 * 30 minutes: records live for 7 days, so counting their whole history would
 * let stale retries from yesterday page on-call today. Pending age is measured
 * for every pending record, however old.
 */
async function sampleDeliveryRecords(env: Env): Promise<{
  sampled: number;
  retried: number;
  oldestPendingAgeMs: number | null;
}> {
  const kv = getWebhookKV(env);
  if (!kv) return { sampled: 0, retried: 0, oldestPendingAgeMs: null };

  const listed = await listAllKvKeys(kv, {
    prefix: DELIVERY_PREFIX,
    maxKeys: WEBHOOK_QUEUE_THRESHOLDS.SAMPLE_LIMIT,
  });
  const records = await fetchInBatches<{ name: string }, WebhookDelivery>(
    listed.keys,
    (key) => kv.get<WebhookDelivery>(key.name, "json"),
  );

  const now = Date.now();
  const windowCutoff = now - WEBHOOK_QUEUE_THRESHOLDS.RETRY_RATE_WINDOW_MS;
  let sampled = 0;
  let retried = 0;
  let oldestPendingAgeMs: number | null = null;

  for (const record of records) {
    if (!record) continue;

    const createdAt = Date.parse(record.created_at);
    const attempts = record.attempts ?? [];
    const isPending =
      record.status === "pending" || record.status === "retrying";

    if (isPending && !Number.isNaN(createdAt)) {
      const age = now - createdAt;
      if (oldestPendingAgeMs === null || age > oldestPendingAgeMs) {
        oldestPendingAgeMs = age;
      }
    }

    const lastAttemptAt = attempts.at(-1)?.timestamp;
    const activityAt = Date.parse(lastAttemptAt ?? "");
    const effectiveAt = Number.isNaN(activityAt) ? createdAt : activityAt;
    if (Number.isNaN(effectiveAt) || effectiveAt < windowCutoff) continue;

    sampled++;
    if (attempts.length > 1) retried++;
  }

  return { sampled, retried, oldestPendingAgeMs };
}

/**
 * Builds a health snapshot from persisted state using a bounded KV sample.
 * Failures degrade to an empty snapshot instead of breaking the caller.
 */
export async function collectWebhookQueueHealth(
  env: Env,
  now: number = Date.now(),
): Promise<WebhookQueueHealth> {
  let dlqDepth = 0;
  let sample = {
    sampled: 0,
    retried: 0,
    oldestPendingAgeMs: null as number | null,
  };

  try {
    dlqDepth = (await getDeadLetterQueue(env)).length;
  } catch (error) {
    logger.warn("Failed to measure webhook DLQ depth (non-critical)", {
      component: "webhook",
      error: toError(error).message,
    });
  }

  try {
    sample = await sampleDeliveryRecords(env);
  } catch (error) {
    logger.warn("Failed to sample webhook delivery records (non-critical)", {
      component: "webhook",
      error: toError(error).message,
    });
  }

  return evaluateWebhookQueueHealth(
    {
      dlqDepth,
      sampledDeliveries: sample.sampled,
      retriedDeliveries: sample.retried,
      oldestPendingAgeMs: sample.oldestPendingAgeMs,
    },
    now,
  );
}

/**
 * Emits one warning log and one alert counter per raised alert. Alerting must
 * never break the caller, so metric failures are swallowed downstream.
 */
export async function reportWebhookQueueAlerts(
  env: Env,
  health: WebhookQueueHealth,
): Promise<void> {
  for (const alert of health.alerts) {
    logger.warn(`Webhook queue alert: ${alert.kind}`, {
      component: "webhook",
      alert: alert.kind,
      value: alert.value,
      threshold: alert.threshold,
      status: health.status,
      detail: alert.detail,
    });
    await recordWebhookMetric(env, WEBHOOK_METRICS.QUEUE_ALERT_TOTAL, 1, {
      kind: alert.kind,
    });
  }
}

/**
 * Prometheus gauges for the admin `/metrics` surface.
 */
export function formatWebhookQueuePrometheus(
  health: WebhookQueueHealth,
): string {
  const oldestSeconds =
    health.oldest_pending_age_ms === null
      ? 0
      : Math.round(health.oldest_pending_age_ms / 1000);
  return [
    "# HELP webhook_queue_dlq_depth Dead-lettered webhook deliveries awaiting replay.",
    "# TYPE webhook_queue_dlq_depth gauge",
    `webhook_queue_dlq_depth ${health.dlq_depth}`,
    "# HELP webhook_queue_retry_rate Share of sampled deliveries that retried.",
    "# TYPE webhook_queue_retry_rate gauge",
    `webhook_queue_retry_rate ${health.retry_rate}`,
    "# HELP webhook_queue_oldest_pending_seconds Age of the oldest pending delivery.",
    "# TYPE webhook_queue_oldest_pending_seconds gauge",
    `webhook_queue_oldest_pending_seconds ${oldestSeconds}`,
    "# HELP webhook_queue_alerts_active Number of raised queue alerts.",
    "# TYPE webhook_queue_alerts_active gauge",
    `webhook_queue_alerts_active ${health.alerts.length}`,
    "",
  ].join("\n");
}
