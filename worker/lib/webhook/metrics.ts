// ============================================================================
// Webhook Delivery Metrics - Structured logs + best-effort D1 points
// ============================================================================

import type { Env } from "../../types";
import { logger } from "../global-logger";
import { writeMetric, type MetricType } from "../d1/system-metrics";

export const WEBHOOK_METRICS = {
  ENQUEUE_TOTAL: "webhook_enqueue_total",
  ENQUEUE_LATENCY_MS: "webhook_enqueue_latency_ms",
  DELIVERY_TOTAL: "webhook_delivery_total",
  DELIVERY_LATENCY_MS: "webhook_delivery_latency_ms",
  RETRY_TOTAL: "webhook_retry_total",
  DLQ_DEPTH: "webhook_dlq_depth",
  QUEUE_ALERT_TOTAL: "webhook_queue_alert_total",
} as const;

/**
 * Emit a webhook metric as a structured log line (always) and, when D1 is
 * bound, as a row in `system_metrics` (best effort). Metrics must never break
 * delivery, so storage failures are swallowed.
 */
export async function recordWebhookMetric(
  env: Env,
  name: string,
  value: number,
  labels: Record<string, string> = {},
  options: { type?: MetricType; durationMs?: number } = {},
): Promise<void> {
  logger.info(`webhook metric: ${name}`, {
    component: "webhook",
    metric: name,
    value,
    ...labels,
    ...(options.durationMs !== undefined
      ? { duration_ms: options.durationMs }
      : {}),
  });

  if (!env.DEALS_DB) return;
  try {
    await writeMetric(env.DEALS_DB, {
      name,
      value,
      type: options.type ?? "counter",
      labels,
      ...(options.durationMs !== undefined
        ? { durationMs: options.durationMs }
        : {}),
    });
  } catch (error) {
    logger.warn("Failed to persist webhook metric (non-critical)", {
      component: "webhook",
      metric: name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
