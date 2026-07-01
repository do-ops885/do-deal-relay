import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
  getCumulativeGateRejections,
  getCumulativeGatePasses,
  getDetailedPhaseTimingStats,
  getPhaseTimingStats,
  type PhaseTimingStats,
} from "../../../worker/lib/metrics/stats";
import type {
  Env,
  PipelineMetrics,
  PipelinePhase,
} from "../../../worker/types";

// ============================================================================
// Test Setup & Mocks
// ============================================================================

describe("metrics/stats", () => {
  let mockGet: Mock;

  const buildEnv = (): Env => {
    mockGet = vi.fn();
    return {
      DEALS_LOG: {
        get: mockGet,
        put: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
      },
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      ENVIRONMENT: "development",
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_API_TOKEN: "test-token",
      DEALS_DB: {} as unknown as Env["DEALS_DB"],
      TRUST_THRESHOLD: "0.3",
      CANDIDATE_BUDGET_GLOBAL: "50",
      CANDIDATE_BUDGET_PER_SOURCE: "5",
      CANDIDATE_BUDGET_HIGH_TRUST_BONUS: "10",
      NOTIFICATION_THRESHOLD: "0.7",
      GITHUB_REPO: "test/repo",
      GITHUB_TOKEN: "",
      JWT_SECRET: "test-jwt",
      JWT_REFRESH_SECRET: undefined,
      EMAIL_WEBHOOK_SECRET: "test-email",
      DEALS_PROD: {} as unknown as Env["DEALS_PROD"],
      DEALS_STAGING: {} as unknown as Env["DEALS_STAGING"],
      DEALS_LOCK: {} as unknown as Env["DEALS_LOCK"],
      DEALS_SOURCES: {} as unknown as Env["DEALS_SOURCES"],
    } as unknown as Env;
  };

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
  // calculateAggregateStats()
  // ============================================================================

  describe("calculateAggregateStats", () => {
    it("returns zeroed defaults for an empty metrics list", () => {
      const result = calculateAggregateStats([]);

      expect(result.total_runs).toBe(0);
      expect(result.successful_runs).toBe(0);
      expect(result.failed_runs).toBe(0);
      expect(result.success_rate).toBe(0);
      expect(result.avg_duration_ms).toBe(0);

      // All phase timings default to 0
      for (const p of Object.keys(result.avg_phase_timings)) {
        expect(result.avg_phase_timings[p as PipelinePhase]).toBe(0);
      }

      // All deals counters default to 0
      for (const v of Object.values(result.avg_deals_per_run)) {
        expect(v).toBe(0);
      }

      expect(result.total_errors).toBe(0);
      expect(result.total_retries).toBe(0);
      expect(result.total_validation_gate_rejections).toEqual({});
      expect(result.total_validation_gate_passes).toEqual({});
    });

    it("counts successful and failed runs correctly", () => {
      const result = calculateAggregateStats([
        buildMetric({ success: true }),
        buildMetric({ success: true }),
        buildMetric({ success: false }),
      ]);

      expect(result.total_runs).toBe(3);
      expect(result.successful_runs).toBe(2);
      expect(result.failed_runs).toBe(1);
      expect(result.success_rate).toBe(66.67);
    });

    it("computes average duration rounded to an integer", () => {
      const result = calculateAggregateStats([
        buildMetric({ total_duration_ms: 100 }),
        buildMetric({ total_duration_ms: 200 }),
        buildMetric({ total_duration_ms: 300 }),
      ]);

      expect(result.avg_duration_ms).toBe(200);
    });

    it("computes average phase timings across all metrics", () => {
      const result = calculateAggregateStats([
        buildMetric({
          phase_timings: { ...basePhaseTimings, discover: 10 },
        }),
        buildMetric({
          phase_timings: { ...basePhaseTimings, discover: 30 },
        }),
      ]);

      expect(result.avg_phase_timings.discover).toBe(20);
    });

    it("averages deals_processed counters (rounded)", () => {
      const result = calculateAggregateStats([
        buildMetric({
          deals_processed: {
            ...buildMetric().deals_processed,
            discovered: 100,
            passed_trust_filter: 80,
          },
        }),
        buildMetric({
          deals_processed: {
            ...buildMetric().deals_processed,
            discovered: 200,
            passed_trust_filter: 100,
          },
        }),
      ]);

      expect(result.avg_deals_per_run.discovered).toBe(150);
      expect(result.avg_deals_per_run.passed_trust_filter).toBe(90);
    });

    it("treats missing passed_trust_filter as 0", () => {
      const customDeals = {
        discovered: 100,
        normalized: 80,
      } as PipelineMetrics["deals_processed"];
      const result = calculateAggregateStats([
        buildMetric({ deals_processed: customDeals }),
      ]);

      expect(result.avg_deals_per_run.discovered).toBe(100);
      expect(result.avg_deals_per_run.passed_trust_filter).toBe(0);
      expect(result.avg_deals_per_run.normalized).toBe(80);
    });

    it("sums errors and retries across all runs", () => {
      const result = calculateAggregateStats([
        buildMetric({ errors: 2, retries: 1 }),
        buildMetric({ errors: 3, retries: 4 }),
        buildMetric({ errors: 1, retries: 0 }),
      ]);

      expect(result.total_errors).toBe(6);
      expect(result.total_retries).toBe(5);
    });

    it("accumulates validation_gate_rejections across runs", () => {
      const result = calculateAggregateStats([
        buildMetric({ validation_gate_rejections: { trust: 2, schema: 1 } }),
        buildMetric({ validation_gate_rejections: { trust: 3, freshness: 1 } }),
      ]);

      expect(result.total_validation_gate_rejections).toEqual({
        trust: 5,
        schema: 1,
        freshness: 1,
      });
    });

    it("accumulates validation_gate_passes across runs", () => {
      const result = calculateAggregateStats([
        buildMetric({ validation_gate_passes: { trust: 10 } }),
        buildMetric({ validation_gate_passes: { trust: 5, schema: 3 } }),
      ]);

      expect(result.total_validation_gate_passes).toEqual({
        trust: 15,
        schema: 3,
      });
    });

    it("averages validation_cache counters when provided", () => {
      const result = calculateAggregateStats([
        buildMetric({
          validation_cache: {
            hit_total: 100,
            miss_total: 50,
            write_total: 10,
            d1_lookup_total: 20,
            dedup_hit_total: 30,
          },
        }),
        buildMetric({
          validation_cache: {
            hit_total: 200,
            miss_total: 100,
            write_total: 20,
            d1_lookup_total: 40,
            dedup_hit_total: 60,
          },
        }),
      ]);

      expect(result.avg_validation_cache.hit_total).toBe(150);
      expect(result.avg_validation_cache.miss_total).toBe(75);
      expect(result.avg_validation_cache.write_total).toBe(15);
      expect(result.avg_validation_cache.d1_lookup_total).toBe(30);
      expect(result.avg_validation_cache.dedup_hit_total).toBe(45);
    });

    it("treats missing validation_cache as 0 for averaging", () => {
      const result = calculateAggregateStats([
        buildMetric({ validation_cache: undefined }),
        buildMetric({
          validation_cache: {
            hit_total: 40,
            miss_total: 0,
            write_total: 0,
            d1_lookup_total: 0,
            dedup_hit_total: 0,
          },
        }),
      ]);

      expect(result.avg_validation_cache.hit_total).toBe(20);
    });
  });

  // ============================================================================
  // getCumulativeGateRejections() / getCumulativeGatePasses()
  // ============================================================================

  describe("getCumulativeGateRejections / Passes", () => {
    it("returns parsed JSON when KV has a stored value", async () => {
      const env = buildEnv();
      mockGet.mockResolvedValueOnce(JSON.stringify({ trust: 42, schema: 7 }));

      const result = await getCumulativeGateRejections(env);
      expect(result).toEqual({ trust: 42, schema: 7 });
      expect(mockGet).toHaveBeenCalledWith(
        "metrics:cumulative_gate_rejections",
      );
    });

    it("returns an empty object when KV returns null", async () => {
      const env = buildEnv();
      mockGet.mockResolvedValueOnce(null);

      const result = await getCumulativeGateRejections(env);
      expect(result).toEqual({});
    });

    it("returns parsed JSON for passes", async () => {
      const env = buildEnv();
      mockGet.mockResolvedValueOnce(
        JSON.stringify({ trust: 100, freshness: 50 }),
      );

      const result = await getCumulativeGatePasses(env);
      expect(result).toEqual({ trust: 100, freshness: 50 });
      expect(mockGet).toHaveBeenCalledWith("metrics:cumulative_gate_passes");
    });

    it("returns empty object when KV returns null for passes", async () => {
      const env = buildEnv();
      mockGet.mockResolvedValueOnce(null);

      const result = await getCumulativeGatePasses(env);
      expect(result).toEqual({});
    });
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
  // getDetailedPhaseTimingStats() / getPhaseTimingStats()
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

  describe("getPhaseTimingStats", () => {
    it("returns min/max/avg/p95 for each phase", () => {
      const metrics = [
        buildMetric({ phase_timings: { ...basePhaseTimings, discover: 100 } }),
        buildMetric({ phase_timings: { ...basePhaseTimings, discover: 200 } }),
      ];

      const stats = getPhaseTimingStats(metrics);
      expect(stats.discover.min).toBe(100);
      expect(stats.discover.max).toBe(200);
      expect(stats.discover.avg).toBe(150);
      expect(stats.discover.p95).toBeGreaterThanOrEqual(100);
    });

    it("returns zeroes for an empty metric list", () => {
      const stats = getPhaseTimingStats([]);
      for (const phase of Object.keys(stats)) {
        const s = stats[phase as PipelinePhase];
        expect(s.min).toBe(0);
        expect(s.max).toBe(0);
        expect(s.avg).toBe(0);
        expect(s.p95).toBe(0);
      }
    });
  });

  // ============================================================================
  // Edge cases
  // ============================================================================

  describe("edge cases", () => {
    it("handles success_rate of exactly 0 when all runs failed", () => {
      const result = calculateAggregateStats([
        buildMetric({ success: false }),
        buildMetric({ success: false }),
      ]);

      expect(result.success_rate).toBe(0);
      expect(result.successful_runs).toBe(0);
      expect(result.failed_runs).toBe(2);
    });

    it("handles success_rate of 100 when all runs succeeded", () => {
      const result = calculateAggregateStats([
        buildMetric({ success: true }),
        buildMetric({ success: true }),
      ]);

      expect(result.success_rate).toBe(100);
    });

    it("handles metrics without validation_gate_rejections field", () => {
      const metrics: PipelineMetrics[] = [
        {
          ...buildMetric(),
          validation_gate_rejections: undefined,
        },
      ];
      const result = calculateAggregateStats(metrics);
      expect(result.total_validation_gate_rejections).toEqual({});
    });

    it("handles metrics without validation_gate_passes field", () => {
      const metrics: PipelineMetrics[] = [
        {
          ...buildMetric(),
          validation_gate_passes: undefined,
        },
      ];
      const result = calculateAggregateStats(metrics);
      expect(result.total_validation_gate_passes).toEqual({});
    });
  });
});
