/**
 * D1 System Metrics Helpers — Single and batch insert for pipeline metrics.
 *
 * Uses D1 batch API for atomic multi-row inserts. The system_metrics table
 * is defined in migration 10 (see schema migration for system_metrics).
 *
 * Column mapping: the table uses `timestamp` (NOT `created_at`).
 */

import type { D1Database } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

export type MetricType = "gauge" | "counter" | "histogram";

export interface SystemMetric {
  name: string;
  value: number;
  type?: MetricType;
  labels?: Record<string, string>;
  runId?: string;
  phase?: string;
  durationMs?: number;
}

// ============================================================================
// SQL
// ============================================================================

const INSERT_SQL = `INSERT INTO system_metrics (metric_name, metric_value, metric_type, labels, run_id, phase, duration_ms, timestamp)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))`;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Write a single system metric.
 */
export async function writeMetric(
  db: D1Database,
  metric: SystemMetric,
): Promise<void> {
  await db
    .prepare(INSERT_SQL)
    .bind(
      metric.name,
      metric.value,
      metric.type ?? "counter",
      metric.labels ? JSON.stringify(metric.labels) : null,
      metric.runId ?? null,
      metric.phase ?? null,
      metric.durationMs ?? null,
    )
    .run();
}

/**
 * Batch-insert multiple system metrics in a single D1 batch call.
 * Empty arrays are a no-op.
 */
export async function writeMetricsBatch(
  db: D1Database,
  metrics: SystemMetric[],
): Promise<void> {
  if (metrics.length === 0) return;

  const stmt = db.prepare(INSERT_SQL);

  await db.batch(
    metrics.map((m) =>
      stmt.bind(
        m.name,
        m.value,
        m.type ?? "counter",
        m.labels ? JSON.stringify(m.labels) : null,
        m.runId ?? null,
        m.phase ?? null,
        m.durationMs ?? null,
      ),
    ),
  );
}
