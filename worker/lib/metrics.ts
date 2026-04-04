import { PipelinePhase } from "../types";
import type { Env } from "../types";
import { CONFIG } from "../config";
import { fetchInBatches } from "./utils";

// ============================================================================
// Pipeline Metrics Types
// ============================================================================

export interface PipelineMetrics {
  run_id: string;
  start_time: number;
  end_time?: number;
  phase_timings: Record<PipelinePhase, number>;
  total_duration_ms: number;
  deals_processed: {
    discovered: number;
    normalized: number;
    deduped: number;
    validated: number;
    scored: number;
    published: number;
  };
  errors: number;
  retries: number;
  success: boolean;
  final_phase: PipelinePhase;
}

// ============================================================================
// Metrics Functions
// ============================================================================

/**
 * Create a new metrics object for a pipeline run
 */
export function createMetrics(run_id: string): PipelineMetrics {
  return {
    run_id,
    start_time: Date.now(),
    phase_timings: {
      init: 0,
      discover: 0,
      normalize: 0,
      dedupe: 0,
      validate: 0,
      score: 0,
      stage: 0,
      publish: 0,
      verify: 0,
      finalize: 0,
    },
    total_duration_ms: 0,
    deals_processed: {
      discovered: 0,
      normalized: 0,
      deduped: 0,
      validated: 0,
      scored: 0,
      published: 0,
    },
    errors: 0,
    retries: 0,
    success: false,
    final_phase: "init",
  };
}

/**
 * Record timing for a specific phase
 */
export function recordPhaseTiming(
  metrics: PipelineMetrics,
  phase: PipelinePhase,
  duration: number,
): void {
  metrics.phase_timings[phase] = duration;
}

/**
 * Update deal counts at each phase
 */
export function recordDealCount(
  metrics: PipelineMetrics,
  phase:
    | "discovered"
    | "normalized"
    | "deduped"
    | "validated"
    | "scored"
    | "published",
  count: number,
): void {
  metrics.deals_processed[phase] = count;
}

/**
 * Record an error occurrence
 */
export function recordError(metrics: PipelineMetrics): void {
  metrics.errors++;
}

/**
 * Record a retry occurrence
 */
export function recordRetry(metrics: PipelineMetrics): void {
  metrics.retries++;
}

/**
 * Finalize metrics at the end of a pipeline run
 */
export function finalizeMetrics(
  metrics: PipelineMetrics,
  success: boolean,
  finalPhase: PipelinePhase,
): PipelineMetrics {
  metrics.end_time = Date.now();
  metrics.total_duration_ms = metrics.end_time - metrics.start_time;
  metrics.success = success;
  metrics.final_phase = finalPhase;
  return metrics;
}

/**
 * Store metrics in KV storage
 */
export async function storeMetrics(
  env: Env,
  metrics: PipelineMetrics,
): Promise<void> {
  const key = `metrics:${metrics.run_id}`;
  const value = JSON.stringify(metrics);

  // Store individual run metrics
  await env.DEALS_LOG.put(key, value, {
    expirationTtl: 7 * 24 * 60 * 60, // 7 days retention
  });

  // Update metrics index
  const indexKey = "metrics:index";
  const indexRaw = await env.DEALS_LOG.get(indexKey);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];

  // Add new run to beginning, keep only last 100 runs
  index.unshift(metrics.run_id);
  if (index.length > 100) {
    index.pop();
  }

  await env.DEALS_LOG.put(indexKey, JSON.stringify(index), {
    expirationTtl: 7 * 24 * 60 * 60,
  });
}

// ============================================================================
// Metrics Retrieval Functions
// ============================================================================

/**
 * Get metrics for a specific run
 */
export async function getMetrics(
  env: Env,
  run_id: string,
): Promise<PipelineMetrics | null> {
  const key = `metrics:${run_id}`;
  const value = await env.DEALS_LOG.get(key);
  return value ? JSON.parse(value) : null;
}

/**
 * Get recent pipeline run metrics
 * Optimization: Parallel batch fetch instead of sequential loop
 */
export async function getRecentMetrics(
  env: Env,
  count: number = 10,
): Promise<PipelineMetrics[]> {
  const indexKey = "metrics:index";
  const indexRaw = await env.DEALS_LOG.get(indexKey);
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];

  const runIds = index.slice(0, count);

  // Use parallel batch fetching for better performance
  return fetchInBatches(runIds, (runId) => getMetrics(env, runId));
}

/**
 * Calculate aggregate statistics from metrics
 */
export function calculateAggregateStats(metrics: PipelineMetrics[]): {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  avg_phase_timings: Record<PipelinePhase, number>;
  avg_deals_per_run: {
    discovered: number;
    normalized: number;
    deduped: number;
    validated: number;
    scored: number;
    published: number;
  };
  total_errors: number;
  total_retries: number;
} {
  if (metrics.length === 0) {
    return {
      total_runs: 0,
      successful_runs: 0,
      failed_runs: 0,
      success_rate: 0,
      avg_duration_ms: 0,
      avg_phase_timings: {
        init: 0,
        discover: 0,
        normalize: 0,
        dedupe: 0,
        validate: 0,
        score: 0,
        stage: 0,
        publish: 0,
        verify: 0,
        finalize: 0,
      },
      avg_deals_per_run: {
        discovered: 0,
        normalized: 0,
        deduped: 0,
        validated: 0,
        scored: 0,
        published: 0,
      },
      total_errors: 0,
      total_retries: 0,
    };
  }

  const successfulRuns = metrics.filter((m) => m.success);
  const failedRuns = metrics.filter((m) => !m.success);

  // Calculate average phase timings
  const phases: PipelinePhase[] = [
    "init",
    "discover",
    "normalize",
    "dedupe",
    "validate",
    "score",
    "stage",
    "publish",
    "verify",
    "finalize",
  ];

  const avgPhaseTimings = {} as Record<PipelinePhase, number>;
  for (const phase of phases) {
    const total = metrics.reduce((sum, m) => sum + m.phase_timings[phase], 0);
    avgPhaseTimings[phase] = Math.round(total / metrics.length);
  }

  // Calculate average deal counts
  const avgDeals = {
    discovered: Math.round(
      metrics.reduce((sum, m) => sum + m.deals_processed.discovered, 0) /
        metrics.length,
    ),
    normalized: Math.round(
      metrics.reduce((sum, m) => sum + m.deals_processed.normalized, 0) /
        metrics.length,
    ),
    deduped: Math.round(
      metrics.reduce((sum, m) => sum + m.deals_processed.deduped, 0) /
        metrics.length,
    ),
    validated: Math.round(
      metrics.reduce((sum, m) => sum + m.deals_processed.validated, 0) /
        metrics.length,
    ),
    scored: Math.round(
      metrics.reduce((sum, m) => sum + m.deals_processed.scored, 0) /
        metrics.length,
    ),
    published: Math.round(
      metrics.reduce((sum, m) => sum + m.deals_processed.published, 0) /
        metrics.length,
    ),
  };

  const totalDuration = metrics.reduce(
    (sum, m) => sum + m.total_duration_ms,
    0,
  );
  const totalErrors = metrics.reduce((sum, m) => sum + m.errors, 0);
  const totalRetries = metrics.reduce((sum, m) => sum + m.retries, 0);

  return {
    total_runs: metrics.length,
    successful_runs: successfulRuns.length,
    failed_runs: failedRuns.length,
    success_rate:
      Math.round((successfulRuns.length / metrics.length) * 100 * 100) / 100,
    avg_duration_ms: Math.round(totalDuration / metrics.length),
    avg_phase_timings: avgPhaseTimings,
    avg_deals_per_run: avgDeals,
    total_errors: totalErrors,
    total_retries: totalRetries,
  };
}

/**
 * Format metrics for Prometheus-style export
 */
export function formatMetricsForPrometheus(
  stats: ReturnType<typeof calculateAggregateStats>,
): string {
  const lines: string[] = [];

  // Run counters
  lines.push("# HELP deals_pipeline_runs_total Total number of pipeline runs");
  lines.push("# TYPE deals_pipeline_runs_total counter");
  lines.push(`deals_pipeline_runs_total ${stats.total_runs}`);

  lines.push(
    "# HELP deals_pipeline_successful_runs_total Number of successful pipeline runs",
  );
  lines.push("# TYPE deals_pipeline_successful_runs_total counter");
  lines.push(`deals_pipeline_successful_runs_total ${stats.successful_runs}`);

  lines.push(
    "# HELP deals_pipeline_failed_runs_total Number of failed pipeline runs",
  );
  lines.push("# TYPE deals_pipeline_failed_runs_total counter");
  lines.push(`deals_pipeline_failed_runs_total ${stats.failed_runs}`);

  lines.push(
    "# HELP deals_pipeline_success_rate Percentage of successful runs",
  );
  lines.push("# TYPE deals_pipeline_success_rate gauge");
  lines.push(`deals_pipeline_success_rate ${stats.success_rate}`);

  // Duration metrics
  lines.push(
    "# HELP deals_pipeline_duration_ms Average pipeline duration in milliseconds",
  );
  lines.push("# TYPE deals_pipeline_duration_ms gauge");
  lines.push(`deals_pipeline_duration_ms ${stats.avg_duration_ms}`);

  // Phase timing gauges
  lines.push(
    "# HELP deals_pipeline_phase_duration_ms Average duration per phase",
  );
  lines.push("# TYPE deals_pipeline_phase_duration_ms gauge");
  for (const [phase, duration] of Object.entries(stats.avg_phase_timings)) {
    lines.push(
      `deals_pipeline_phase_duration_ms{phase="${phase}"} ${duration}`,
    );
  }

  // Deal counts
  lines.push("# HELP deals_pipeline_deals_avg Average deals processed per run");
  lines.push("# TYPE deals_pipeline_deals_avg gauge");
  lines.push(
    `deals_pipeline_deals_avg{stage="discovered"} ${stats.avg_deals_per_run.discovered}`,
  );
  lines.push(
    `deals_pipeline_deals_avg{stage="normalized"} ${stats.avg_deals_per_run.normalized}`,
  );
  lines.push(
    `deals_pipeline_deals_avg{stage="deduped"} ${stats.avg_deals_per_run.deduped}`,
  );
  lines.push(
    `deals_pipeline_deals_avg{stage="validated"} ${stats.avg_deals_per_run.validated}`,
  );
  lines.push(
    `deals_pipeline_deals_avg{stage="scored"} ${stats.avg_deals_per_run.scored}`,
  );
  lines.push(
    `deals_pipeline_deals_avg{stage="published"} ${stats.avg_deals_per_run.published}`,
  );

  // Errors and retries
  lines.push("# HELP deals_pipeline_errors_total Total errors encountered");
  lines.push("# TYPE deals_pipeline_errors_total counter");
  lines.push(`deals_pipeline_errors_total ${stats.total_errors}`);

  lines.push("# HELP deals_pipeline_retries_total Total retries performed");
  lines.push("# TYPE deals_pipeline_retries_total counter");
  lines.push(`deals_pipeline_retries_total ${stats.total_retries}`);

  return lines.join("\n");
}

/**
 * Get phase timing statistics for a set of metrics
 */
export function getPhaseTimingStats(
  metrics: PipelineMetrics[],
): Record<
  PipelinePhase,
  { min: number; max: number; avg: number; p95: number }
> {
  const phases: PipelinePhase[] = [
    "init",
    "discover",
    "normalize",
    "dedupe",
    "validate",
    "score",
    "stage",
    "publish",
    "verify",
    "finalize",
  ];

  const stats = {} as Record<
    PipelinePhase,
    { min: number; max: number; avg: number; p95: number }
  >;

  for (const phase of phases) {
    const timings = metrics
      .map((m) => m.phase_timings[phase])
      .filter((t) => t > 0);

    if (timings.length === 0) {
      stats[phase] = { min: 0, max: 0, avg: 0, p95: 0 };
      continue;
    }

    const sorted = [...timings].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = sorted[Math.max(0, p95Index)];

    stats[phase] = { min, max, avg, p95 };
  }

  return stats;
}
