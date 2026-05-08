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
  metrics: PipelineMetrics[] = [],
): string {
  const lines: string[] = [
    `# HELP deals_pipeline_runs_total Total discovery runs`,
    `# TYPE deals_pipeline_runs_total counter`,
    `deals_pipeline_runs_total ${stats.total_runs}`,
    `# HELP deals_pipeline_successful_runs_total Successful publishes`,
    `deals_pipeline_successful_runs_total ${stats.successful_runs}`,
    `# HELP deals_pipeline_failed_runs_total Failed discovery runs`,
    `deals_pipeline_failed_runs_total ${stats.failed_runs}`,
    `# HELP deals_pipeline_success_rate Success rate percentage`,
    `deals_pipeline_success_rate ${stats.success_rate}`,
    `# HELP deals_pipeline_duration_ms Average end-to-end duration`,
    `deals_pipeline_duration_ms ${stats.avg_duration_ms}`,
  ];

  // Add detailed phase timings
  if (metrics.length > 0) {
    const detailed = getDetailedPhaseTimingStats(metrics);
    for (const [phase, statuses] of Object.entries(detailed)) {
      for (const [status, s] of Object.entries(statuses)) {
        if (s.max === 0) continue; // Skip if no data
        lines.push(
          `deals_pipeline_phase_duration_ms{phase="${phase}",status="${status}",quantile="0.5"} ${s.p50}`,
        );
        lines.push(
          `deals_pipeline_phase_duration_ms{phase="${phase}",status="${status}",quantile="0.9"} ${s.p90}`,
        );
        lines.push(
          `deals_pipeline_phase_duration_ms{phase="${phase}",status="${status}",quantile="0.99"} ${s.p99}`,
        );
        lines.push(
          `deals_pipeline_phase_duration_ms_avg{phase="${phase}",status="${status}"} ${s.avg}`,
        );
        lines.push(
          `deals_pipeline_phase_duration_ms_max{phase="${phase}",status="${status}"} ${s.max}`,
        );
      }
    }

    // Add total duration quantiles
    const totalTimingsSuccess = metrics
      .filter((m) => m.success)
      .map((m) => m.total_duration_ms);
    const totalTimingsFailure = metrics
      .filter((m) => !m.success)
      .map((m) => m.total_duration_ms);

    const successStats = calculateStats(totalTimingsSuccess);
    const failureStats = calculateStats(totalTimingsFailure);

    if (successStats.max > 0) {
      lines.push(
        `deals_pipeline_total_duration_ms{status="success",quantile="0.5"} ${successStats.p50}`,
      );
      lines.push(
        `deals_pipeline_total_duration_ms{status="success",quantile="0.9"} ${successStats.p90}`,
      );
      lines.push(
        `deals_pipeline_total_duration_ms{status="success",quantile="0.99"} ${successStats.p99}`,
      );
    }
    if (failureStats.max > 0) {
      lines.push(
        `deals_pipeline_total_duration_ms{status="failure",quantile="0.5"} ${failureStats.p50}`,
      );
      lines.push(
        `deals_pipeline_total_duration_ms{status="failure",quantile="0.9"} ${failureStats.p90}`,
      );
      lines.push(
        `deals_pipeline_total_duration_ms{status="failure",quantile="0.99"} ${failureStats.p99}`,
      );
    }
  } else {
    // Fallback to average phase timings if no individual metrics provided
    for (const [p, d] of Object.entries(stats.avg_phase_timings))
      lines.push(
        `deals_pipeline_phase_duration_ms{phase="${p}",status="success",quantile="0.5"} ${d}`,
      );
  }

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

export interface PhaseTimingStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export function getDetailedPhaseTimingStats(
  metrics: PipelineMetrics[],
): Record<PipelinePhase, Record<"success" | "failure", PhaseTimingStats>> {
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
    res[p] = {
      success: calculateStats(
        metrics
          .filter((m) => m.phase_results?.[p] === "success" || !m.phase_results)
          .map((m) => m.phase_timings[p])
          .filter((t) => t > 0),
      ),
      failure: calculateStats(
        metrics
          .filter((m) => m.phase_results?.[p] === "failure")
          .map((m) => m.phase_timings[p])
          .filter((t) => t > 0),
      ),
    };
  }
  return res;
}

function calculateStats(timings: number[]): PhaseTimingStats {
  if (timings.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const getQuantile = (q: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p50: getQuantile(0.5),
    p90: getQuantile(0.9),
    p95: getQuantile(0.95),
    p99: getQuantile(0.99),
  };
}

export function getPhaseTimingStats(
  metrics: PipelineMetrics[],
): Record<
  PipelinePhase,
  { min: number; max: number; avg: number; p95: number }
> {
  const detailed = getDetailedPhaseTimingStats(metrics);
  const res = {} as any;
  for (const [p, stats] of Object.entries(detailed)) {
    // For backward compatibility, combine success and failure for the old return type if needed,
    // or just use success path which is the most common.
    // Given the old one didn't distinguish, let's recalculate over all timings for this phase.
    const allTimings = metrics
      .map((m) => m.phase_timings[p as PipelinePhase])
      .filter((t) => t > 0);
    const statsAll = calculateStats(allTimings);
    res[p] = {
      min: statsAll.min,
      max: statsAll.max,
      avg: statsAll.avg,
      p95: statsAll.p95,
    };
  }
  return res;
}
