import type { PipelinePhase, PipelineMetrics } from "../../types";

export function calculateAggregateStats(metrics: PipelineMetrics[]) {
  if (metrics.length === 0)
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
      } as Record<PipelinePhase, number>,
      avg_deals_per_run: {
        discovered: 0,
        normalized: 0,
        deduped: 0,
        validated: 0,
        scored: 0,
        published: 0,
      },
      avg_validation_cache: {
        hit_total: 0,
        miss_total: 0,
        write_total: 0,
        d1_lookup_total: 0,
        dedup_hit_total: 0,
      },
      total_errors: 0,
      total_retries: 0,
    };
  const successful = metrics.filter((m) => m.success);
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
  for (const p of phases) {
    avgPhaseTimings[p] = Math.round(
      metrics.reduce((s, m) => s + m.phase_timings[p], 0) / metrics.length,
    );
  }
  return {
    total_runs: metrics.length,
    successful_runs: successful.length,
    failed_runs: metrics.length - successful.length,
    success_rate:
      Math.round((successful.length / metrics.length) * 10000) / 100,
    avg_duration_ms: Math.round(
      metrics.reduce((s, m) => s + m.total_duration_ms, 0) / metrics.length,
    ),
    avg_phase_timings: avgPhaseTimings,
    avg_deals_per_run: {
      discovered: Math.round(
        metrics.reduce((s, m) => s + m.deals_processed.discovered, 0) /
          metrics.length,
      ),
      normalized: Math.round(
        metrics.reduce((s, m) => s + m.deals_processed.normalized, 0) /
          metrics.length,
      ),
      deduped: Math.round(
        metrics.reduce((s, m) => s + m.deals_processed.deduped, 0) /
          metrics.length,
      ),
      validated: Math.round(
        metrics.reduce((s, m) => s + m.deals_processed.validated, 0) /
          metrics.length,
      ),
      scored: Math.round(
        metrics.reduce((s, m) => s + m.deals_processed.scored, 0) /
          metrics.length,
      ),
      published: Math.round(
        metrics.reduce((s, m) => s + m.deals_processed.published, 0) /
          metrics.length,
      ),
    },
    avg_validation_cache: {
      hit_total: Math.round(
        metrics.reduce((s, m) => s + (m.validation_cache?.hit_total || 0), 0) /
          metrics.length,
      ),
      miss_total: Math.round(
        metrics.reduce((s, m) => s + (m.validation_cache?.miss_total || 0), 0) /
          metrics.length,
      ),
      write_total: Math.round(
        metrics.reduce(
          (s, m) => s + (m.validation_cache?.write_total || 0),
          0,
        ) / metrics.length,
      ),
      d1_lookup_total: Math.round(
        metrics.reduce(
          (s, m) => s + (m.validation_cache?.d1_lookup_total || 0),
          0,
        ) / metrics.length,
      ),
      dedup_hit_total: Math.round(
        metrics.reduce(
          (s, m) => s + (m.validation_cache?.dedup_hit_total || 0),
          0,
        ) / metrics.length,
      ),
    },
    total_errors: metrics.reduce((s, m) => s + m.errors, 0),
    total_retries: metrics.reduce((s, m) => s + m.retries, 0),
  };
}

export function formatMetricsForPrometheus(
  stats: ReturnType<typeof calculateAggregateStats>,
): string {
  const lines: string[] = [
    `deals_pipeline_runs_total ${stats.total_runs}`,
    `deals_pipeline_successful_runs_total ${stats.successful_runs}`,
    `deals_pipeline_failed_runs_total ${stats.failed_runs}`,
    `deals_pipeline_success_rate ${stats.success_rate}`,
    `deals_pipeline_duration_ms ${stats.avg_duration_ms}`,
  ];
  for (const [p, d] of Object.entries(stats.avg_phase_timings))
    lines.push(`deals_pipeline_phase_duration_ms{phase="${p}"} ${d}`);
  for (const [s, c] of Object.entries(stats.avg_deals_per_run))
    lines.push(`deals_pipeline_deals_avg{stage="${s}"} ${c}`);
  if (stats.avg_validation_cache) {
    for (const [t, c] of Object.entries(stats.avg_validation_cache))
      lines.push(`deals_validation_cache_avg{type="${t}"} ${c}`);
  }
  lines.push(`deals_pipeline_errors_total ${stats.total_errors}`);
  lines.push(`deals_pipeline_retries_total ${stats.total_retries}`);
  return lines.join("\n");
}

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
  const res = {} as any;
  for (const p of phases) {
    const timings = metrics
      .map((m) => m.phase_timings[p])
      .filter((t) => t > 0)
      .sort((a, b) => a - b);
    if (timings.length === 0) {
      res[p] = { min: 0, max: 0, avg: 0, p95: 0 };
      continue;
    }
    res[p] = {
      min: timings[0],
      max: timings[timings.length - 1],
      avg: Math.round(timings.reduce((a, b) => a + b, 0) / timings.length),
      p95: timings[Math.max(0, Math.ceil(timings.length * 0.95) - 1)],
    };
  }
  return res;
}
