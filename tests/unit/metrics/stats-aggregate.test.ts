import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  calculateAggregateStats,
  getCumulativeGateRejections,
  getCumulativeGatePasses,
  getPhaseTimingStats,
} from "../../../worker/lib/metrics/stats";
import type {
  Env,
  PipelineMetrics,
  PipelinePhase,
} from "../../../worker/types";

// ============================================================================
// Test Setup & Mocks
// ============================================================================

describe("metrics/stats - aggregate", () => {
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
  // getPhaseTimingStats()
  // ============================================================================

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
