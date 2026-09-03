import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
  getDetailedPhaseTimingStats,
  type PhaseTimingStats,
} from "../../../worker/lib/metrics/stats";
import type { PipelineMetrics, PipelinePhase } from "../../../worker/types";

// ============================================================================
// Test Setup & Mocks
// ============================================================================

describe("metrics/stats - format and timing", () => {
  // Default all-phases template reused by individual tests
  const basePhaseTimings: Record<PipelinePhase, number> = {
    init: 10,
    discover: 20,
    normalize: 15,
    dedupe: 25,
    validate: 30,
    score: 18,
    stage: 12,
    publish: 22,
    verify: 8,
    finalize: 5,
  };

  const buildMetric = (
    overrides: Partial<PipelineMetrics> = {},
  ): PipelineMetrics => ({
    run_id: "run-1",
    success: true,
    start_time: 1705310400000,
    end_time: 1705310400165,
    final_phase: "finalize",
    total_duration_ms: 165,
    phase_timings: basePhaseTimings,
    deals_processed: {
      discovered: 100,
      passed_trust_filter: 90,
      normalized: 80,
      deduped: 70,
      validated: 60,
      scored: 50,
      published: 40,
    },
    errors: 0,
    retries: 0,
    validation_cache: {
      hit_total: 0,
      miss_total: 0,
      write_total: 0,
      d1_lookup_total: 0,
      dedup_hit_total: 0,
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
    validation_gate_rejections: {},
    validation_gate_passes: { trust: 90, schema: 80 },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // formatMetricsForPrometheus()
  // ============================================================================

  describe("formatMetricsForPrometheus", () => {
    it("includes the standard aggregate counters in the output", () => {
      const stats = calculateAggregateStats([
        buildMetric({ success: true }),
        buildMetric({ success: false }),
      ]);

      const out = formatMetricsForPrometheus(stats);
      expect(out).toContain(
        "# HELP deals_pipeline_runs_total Total discovery runs",
      );
      expect(out).toContain("# TYPE deals_pipeline_runs_total counter");
      expect(out).toContain("deals_pipeline_runs_total 2");
      expect(out).toContain("deals_pipeline_successful_runs_total 1");
      expect(out).toContain("deals_pipeline_failed_runs_total 1");
      expect(out).toContain("deals_pipeline_success_rate");
      expect(out).toContain("deals_pipeline_duration_ms");
    });

    it("emits phase duration quantiles when metrics provided", () => {
      const metrics = [
        buildMetric({ phase_timings: { ...basePhaseTimings, discover: 50 } }),
        buildMetric({ phase_timings: { ...basePhaseTimings, discover: 100 } }),
      ];
      const stats = calculateAggregateStats(metrics);

      const out = formatMetricsForPrometheus(stats, metrics);
      expect(out).toContain(`phase="discover"`);
      expect(out).toContain('quantile="0.5"');
      expect(out).toContain('quantile="0.99"');
    });

    it("emits stage_latency_ms for discovery/validation/publish stages with positive timings", () => {
      const metrics = [
        buildMetric({
          phase_timings: {
            ...basePhaseTimings,
            discover: 50,
            validate: 100,
            publish: 80,
          },
        }),
      ];
      const stats = calculateAggregateStats(metrics);

      const out = formatMetricsForPrometheus(stats, metrics);
      expect(out).toContain("# HELP stage_latency_ms");
      expect(out).toContain("# TYPE stage_latency_ms gauge");
      expect(out).toContain('stage="discovery"');
      expect(out).toContain('stage="validation"');
      expect(out).toContain('stage="publish"');
      expect(out).toContain('percentile="p50"');
      expect(out).toContain('percentile="p95"');
      expect(out).toContain('percentile="p99"');
    });

    it("does NOT emit stage_latency_ms when a stage has zero timings", () => {
      const zeroTimings: Record<PipelinePhase, number> = {
        ...basePhaseTimings,
        discover: 0,
        validate: 0,
        publish: 0,
      };
      const metrics = [buildMetric({ phase_timings: zeroTimings })];
      const stats = calculateAggregateStats(metrics);

      const out = formatMetricsForPrometheus(stats, metrics);
      expect(out).toContain("# TYPE stage_latency_ms gauge");
      // No data points should be emitted
      expect(out).not.toMatch(/stage_latency_ms\{stage=/);
    });

    it("emits validation_gate_rejections and validation_gate_rejection_ratio when provided", () => {
      const stats = calculateAggregateStats([]);
      const cumulativeRejections = { trust: 5, schema: 2 };
      const cumulativePasses = { trust: 95, schema: 98, freshness: 100 };

      const out = formatMetricsForPrometheus(
        stats,
        [],
        cumulativeRejections,
        cumulativePasses,
      );

      expect(out).toContain('validation_gate_rejections{gate="trust"} 5');
      expect(out).toContain('validation_gate_rejections{gate="schema"} 2');
      expect(out).toContain('validation_gate_passes{gate="trust"} 95');
      expect(out).toContain("validation_gate_rejection_ratio");

      // ratio for trust gate = 5 / (5+95) = 0.05
      expect(out).toContain(
        'validation_gate_rejection_ratio{gate="trust"} 0.0500',
      );
      // schema = 2/(2+98) = 0.02
      expect(out).toContain(
        'validation_gate_rejection_ratio{gate="schema"} 0.0200',
      );
      // freshness ratio = 0 / (0+100) = 0
      expect(out).toContain(
        'validation_gate_rejection_ratio{gate="freshness"} 0.0000',
      );
    });

    it("emits error/retry counters from stats", () => {
      const stats = calculateAggregateStats([
        buildMetric({ errors: 4, retries: 2 }),
      ]);

      const out = formatMetricsForPrometheus(stats);
      expect(out).toContain("deals_pipeline_errors_total 4");
      expect(out).toContain("deals_pipeline_retries_total 2");
    });

    it("falls back to avg_phase_timings when no metrics provided", () => {
      const stats = calculateAggregateStats([buildMetric()]);

      const out = formatMetricsForPrometheus(stats);
      // Should include phase timings based on averages
      expect(out).toContain('phase="discover"');
      expect(out).toContain('phase="validate"');
    });

    it("emits avg_deals_per_run and avg_validation_cache counters", () => {
      const stats = calculateAggregateStats([buildMetric()]);

      const out = formatMetricsForPrometheus(stats);
      expect(out).toContain('deals_pipeline_deals_avg{stage="discovered"}');
      expect(out).toContain('deals_pipeline_deals_avg{stage="published"}');
      expect(out).toContain("deals_validation_cache_avg");
    });

    it("uses cumulative values not stats when both are provided for gates", () => {
      const stats = calculateAggregateStats([
        buildMetric({ validation_gate_rejections: { trust: 100 } }),
      ]);

      // Cumulative (overrides since cumulative value exists)
      const out = formatMetricsForPrometheus(stats, [], { trust: 7 }, {});
      expect(out).toContain('validation_gate_rejections{gate="trust"} 7');
    });
  });

  // ============================================================================
  // getDetailedPhaseTimingStats()
  // ============================================================================

  describe("getDetailedPhaseTimingStats", () => {
    it("returns zero stats for all phases when no metrics provided", () => {
      const stats = getDetailedPhaseTimingStats([]);
      const expectedEmpty: PhaseTimingStats = {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      };

      for (const phase of Object.keys(stats)) {
        expect(stats[phase as PipelinePhase].success).toEqual(expectedEmpty);
        expect(stats[phase as PipelinePhase].failure).toEqual(expectedEmpty);
      }
    });

    it("groups timings by phase_results status (success/failure)", () => {
      const metrics = [
        buildMetric({
          phase_results: {
            ...basePhaseTimings,
            validate: "failure",
          } as unknown as PipelineMetrics["phase_results"],
          phase_timings: { ...basePhaseTimings, validate: 200 },
          success: false,
        }),
        buildMetric({
          phase_results: {
            ...basePhaseTimings,
            validate: "success",
          } as unknown as PipelineMetrics["phase_results"],
          phase_timings: { ...basePhaseTimings, validate: 50 },
          success: true,
        }),
      ];

      const stats = getDetailedPhaseTimingStats(metrics);
      expect(stats.validate.success.max).toBe(50);
      expect(stats.validate.failure.max).toBe(200);
    });

    it("treats metrics with no phase_results as success for all phases", () => {
      const metrics = [
        buildMetric({
          phase_results: undefined,
          phase_timings: { ...basePhaseTimings, discover: 50 },
        }),
      ];

      const stats = getDetailedPhaseTimingStats(metrics);
      expect(stats.discover.success.avg).toBe(50);
      expect(stats.discover.failure.max).toBe(0);
    });

    it("ignores zero timings in percentile calculations", () => {
      const metrics = [
        buildMetric({
          phase_timings: { ...basePhaseTimings, discover: 0 },
          success: false,
          phase_results: {
            ...basePhaseTimings,
            discover: "success",
          } as unknown as PipelineMetrics["phase_results"],
        }),
      ];

      const stats = getDetailedPhaseTimingStats(metrics);
      expect(stats.discover.success.max).toBe(0);
    });
  });
});
