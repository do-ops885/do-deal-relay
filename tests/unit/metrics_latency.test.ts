import { describe, it, expect } from "vitest";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
} from "../../worker/lib/metrics/stats";
import { PipelineMetrics } from "../../worker/types";

describe("Latency Metrics", () => {
  // Create 100 mock metrics to properly test quantiles (p50, p95, p99)
  const mockMetrics: PipelineMetrics[] = Array.from(
    { length: 100 },
    (_, i) => ({
      run_id: `run${i}`,
      start_time: 1000,
      end_time: 2000,
      total_duration_ms: 1000 + i,
      success: i % 10 !== 0, // 90% success rate
      final_phase: "finalize",
      phase_timings: {
        init: 10,
        discover: 100 + i, // 100 to 199
        normalize: 50,
        dedupe: 50,
        validate: 200 + i, // 200 to 299
        score: 100,
        stage: 100,
        publish: 150 + i, // 150 to 249
        verify: 30,
        finalize: 10,
      },
      phase_results: {
        init: "success",
        discover: "success",
        normalize: "success",
        dedupe: "success",
        validate: i % 10 === 0 ? "failure" : "success",
        score: "success",
        stage: "success",
        publish: "success",
        verify: "success",
        finalize: "success",
      },
      deals_processed: {
        discovered: 10,
        normalized: 10,
        deduped: 8,
        validated: 5,
        scored: 5,
        published: 5,
      },
      errors: i % 10 === 0 ? 1 : 0,
      retries: 0,
    }),
  );

  it("should calculate aggregate stats with latency correctly", () => {
    const stats = calculateAggregateStats(mockMetrics);
    expect(stats.total_runs).toBe(100);
    expect(stats.successful_runs).toBe(90);
    expect(stats.failed_runs).toBe(10);
    // Avg discover: (100 + 199) / 2 = 149.5 -> 150
    expect(stats.avg_phase_timings.discover).toBe(150);
    // Avg validate: (200 + 299) / 2 = 249.5 -> 250
    expect(stats.avg_phase_timings.validate).toBe(250);
  });

  it("should format Prometheus metrics with stage_latency_ms", () => {
    const stats = calculateAggregateStats(mockMetrics);
    const prometheus = formatMetricsForPrometheus(stats, mockMetrics);

    // Metadata
    expect(prometheus).toContain(
      "# HELP stage_latency_ms Latency per pipeline stage in milliseconds",
    );
    expect(prometheus).toContain("# TYPE stage_latency_ms gauge");

    // discovery (discover phase)
    // sorted timings: 100, 101, ..., 199 (length 100)
    // getQuantile(q) = sorted[Math.ceil(100 * q) - 1]
    // p50 (q=0.5): index 49 -> 149
    // p95 (q=0.95): index 94 -> 194
    // p99 (q=0.99): index 98 -> 198
    expect(prometheus).toContain(
      'stage_latency_ms{stage="discovery",percentile="p50"} 149',
    );
    expect(prometheus).toContain(
      'stage_latency_ms{stage="discovery",percentile="p95"} 194',
    );
    expect(prometheus).toContain(
      'stage_latency_ms{stage="discovery",percentile="p99"} 198',
    );

    // validation (validate phase)
    // sorted timings: 200, 201, ..., 299
    expect(prometheus).toContain(
      'stage_latency_ms{stage="validation",percentile="p50"} 249',
    );
    expect(prometheus).toContain(
      'stage_latency_ms{stage="validation",percentile="p95"} 294',
    );
    expect(prometheus).toContain(
      'stage_latency_ms{stage="validation",percentile="p99"} 298',
    );

    // publish (publish phase)
    // sorted timings: 150, 151, ..., 249
    expect(prometheus).toContain(
      'stage_latency_ms{stage="publish",percentile="p50"} 199',
    );
    expect(prometheus).toContain(
      'stage_latency_ms{stage="publish",percentile="p95"} 244',
    );
    expect(prometheus).toContain(
      'stage_latency_ms{stage="publish",percentile="p99"} 248',
    );
  });

  it("should handle empty metrics array gracefully", () => {
    const stats = calculateAggregateStats([]);
    const prometheus = formatMetricsForPrometheus(stats, []);
    expect(prometheus).toContain("deals_pipeline_runs_total 0");
    expect(prometheus).not.toContain("stage_latency_ms");
  });
});
