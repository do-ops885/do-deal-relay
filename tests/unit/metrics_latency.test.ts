import { describe, it, expect } from "vitest";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
} from "../../worker/lib/metrics/stats";
import { PipelineMetrics, PipelinePhase } from "../../worker/types";

describe("Latency Metrics", () => {
  const mockMetrics: PipelineMetrics[] = [
    {
      run_id: "run1",
      start_time: 1000,
      end_time: 2000,
      total_duration_ms: 1000,
      success: true,
      final_phase: "finalize",
      phase_timings: {
        init: 10,
        discover: 200,
        normalize: 50,
        dedupe: 50,
        validate: 300,
        score: 100,
        stage: 100,
        publish: 150,
        verify: 30,
        finalize: 10,
      },
      phase_results: {
        init: "success",
        discover: "success",
        normalize: "success",
        dedupe: "success",
        validate: "success",
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
      errors: 0,
      retries: 0,
    },
    {
      run_id: "run2",
      start_time: 2000,
      end_time: 2500,
      total_duration_ms: 500,
      success: false,
      final_phase: "validate",
      phase_timings: {
        init: 10,
        discover: 150,
        normalize: 40,
        dedupe: 40,
        validate: 260,
        score: 0,
        stage: 0,
        publish: 0,
        verify: 0,
        finalize: 0,
      },
      phase_results: {
        init: "success",
        discover: "success",
        normalize: "success",
        dedupe: "success",
        validate: "failure",
        score: "success", // default
        stage: "success",
        publish: "success",
        verify: "success",
        finalize: "success",
      },
      deals_processed: {
        discovered: 5,
        normalized: 5,
        deduped: 4,
        validated: 0,
        scored: 0,
        published: 0,
      },
      errors: 1,
      retries: 0,
    },
  ];

  it("should calculate aggregate stats with latency correctly", () => {
    const stats = calculateAggregateStats(mockMetrics);
    expect(stats.total_runs).toBe(2);
    expect(stats.successful_runs).toBe(1);
    expect(stats.failed_runs).toBe(1);
    expect(stats.avg_duration_ms).toBe(750);
    expect(stats.avg_phase_timings.discover).toBe(175);
    expect(stats.avg_phase_timings.validate).toBe(280);
  });

  it("should format Prometheus metrics with labels and quantiles", () => {
    const stats = calculateAggregateStats(mockMetrics);
    const prometheus = formatMetricsForPrometheus(stats, mockMetrics);

    // Check for new phase duration metrics with status and quantile labels
    expect(prometheus).toContain(
      'deals_pipeline_phase_duration_ms{phase="discover",status="success",quantile="0.5"}',
    );
    expect(prometheus).toContain(
      'deals_pipeline_phase_duration_ms{phase="validate",status="failure",quantile="0.5"}',
    );

    // Check for average and max helpers
    expect(prometheus).toContain(
      'deals_pipeline_phase_duration_ms_avg{phase="discover",status="success"} 175',
    );
    expect(prometheus).toContain(
      'deals_pipeline_phase_duration_ms_max{phase="validate",status="success"} 300',
    );
    expect(prometheus).toContain(
      'deals_pipeline_phase_duration_ms_max{phase="validate",status="failure"} 260',
    );

    // Check for total duration quantiles
    expect(prometheus).toContain(
      'deals_pipeline_total_duration_ms{status="success",quantile="0.5"} 1000',
    );
    expect(prometheus).toContain(
      'deals_pipeline_total_duration_ms{status="failure",quantile="0.5"} 500',
    );
  });

  it("should handle empty metrics array gracefully", () => {
    const stats = calculateAggregateStats([]);
    const prometheus = formatMetricsForPrometheus(stats, []);
    expect(prometheus).toContain("deals_pipeline_runs_total 0");
  });
});
