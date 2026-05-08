import { describe, it, expect } from "vitest";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
} from "../../worker/lib/metrics/stats";
import { PipelineMetrics } from "../../worker/types";

describe("Metrics Formatting", () => {
  const mockMetrics: PipelineMetrics = {
    run_id: "test-run",
    start_time: Date.now(),
    end_time: Date.now() + 1000,
    phase_timings: {
      init: 10,
      discover: 100,
      normalize: 20,
      dedupe: 30,
      validate: 150,
      score: 50,
      stage: 40,
      publish: 200,
      verify: 10,
      finalize: 5,
    },
    total_duration_ms: 615,
    deals_processed: {
      discovered: 10,
      normalized: 9,
      deduped: 8,
      validated: 7,
      scored: 7,
      published: 7,
    },
    validation_gates: {
      schema_validation: { passed: 10, failed: 0 },
      source_trust: { passed: 8, failed: 2 },
    },
    errors: 0,
    retries: 0,
    success: true,
    final_phase: "finalize",
  };

  it("should include validation gate metrics in Prometheus output", () => {
    const stats = calculateAggregateStats([mockMetrics]);
    const prometheus = formatMetricsForPrometheus(stats);

    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_passed_avg{gate="schema_validation"} 10',
    );
    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_failed_avg{gate="schema_validation"} 0',
    );
    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_passed_avg{gate="source_trust"} 8',
    );
    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_failed_avg{gate="source_trust"} 2',
    );
  });

  it("should aggregate validation gate metrics correctly across multiple runs", () => {
    const metrics2: PipelineMetrics = {
      ...mockMetrics,
      validation_gates: {
        schema_validation: { passed: 5, failed: 5 },
        source_trust: { passed: 2, failed: 8 },
      },
    };

    const stats = calculateAggregateStats([mockMetrics, metrics2]);
    const prometheus = formatMetricsForPrometheus(stats);

    // schema_validation: (10 + 5) / 2 = 7.5
    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_passed_avg{gate="schema_validation"} 7.5',
    );
    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_failed_avg{gate="schema_validation"} 2.5',
    );

    // source_trust: (8 + 2) / 2 = 5
    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_passed_avg{gate="source_trust"} 5',
    );
    expect(prometheus).toContain(
      'deals_pipeline_validation_gate_failed_avg{gate="source_trust"} 5',
    );
  });
});
