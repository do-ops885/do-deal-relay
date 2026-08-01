import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
  getPhaseTimingStats,
  getDetailedPhaseTimingStats,
  getCumulativeGateRejections,
  getCumulativeGatePasses,
} from "../../worker/lib/metrics/stats";
import type { PipelineMetrics, Env } from "../../worker/types";

function createMockMetrics(
  runId: string,
  overrides: Partial<PipelineMetrics> = {},
): PipelineMetrics {
  return {
    run_id: runId,
    start_time: overrides.start_time ?? Date.now(),
    end_time: overrides.end_time ?? Date.now() + 5000,
    total_duration_ms: overrides.total_duration_ms ?? 5000,
    success: overrides.success ?? true,
    final_phase: overrides.final_phase ?? "publish",
    phase_timings: {
      init: 10,
      discover: 100,
      normalize: 50,
      dedupe: 30,
      validate: 80,
      score: 40,
      stage: 20,
      publish: 60,
      verify: 15,
      finalize: 5,
      ...overrides.phase_timings,
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
      ...overrides.phase_results,
    },
    deals_processed: {
      discovered: 100,
      passed_trust_filter: 80,
      normalized: 70,
      deduped: 60,
      validated: 50,
      scored: 40,
      published: 30,
      ...overrides.deals_processed,
    },
    errors: overrides.errors ?? 0,
    retries: overrides.retries ?? 0,
    validation_gate_rejections: overrides.validation_gate_rejections,
    validation_gate_passes: overrides.validation_gate_passes,
    validation_cache: overrides.validation_cache,
  };
}

function createMockEnv(kvStore: Map<string, string>): Env {
  return {
    DEALS_PROD: {} as unknown as KVNamespace,
    DEALS_STAGING: {} as unknown as KVNamespace,
    DEALS_LOG: {
      get: vi.fn(async (key: string) => {
        const value = kvStore.get(key);
        return value !== undefined ? value : null;
      }),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    } as unknown as KVNamespace,
    DEALS_LOCK: {} as unknown as KVNamespace,
    DEALS_SOURCES: {} as unknown as KVNamespace,
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
    DEALS_DB: {} as any,
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    GITHUB_TOKEN: "test-token",
    NOTIFICATION_THRESHOLD: "100",
  } as unknown as Env;
}

describe("calculateAggregateStats", () => {
  it("should return zeros for empty metrics array", () => {
    const result = calculateAggregateStats([]);

    expect(result.total_runs).toBe(0);
    expect(result.successful_runs).toBe(0);
    expect(result.failed_runs).toBe(0);
    expect(result.success_rate).toBe(0);
    expect(result.avg_duration_ms).toBe(0);
    expect(result.total_errors).toBe(0);
    expect(result.total_retries).toBe(0);
  });

  it("should return correct stats for a single successful metric", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", { total_duration_ms: 4200 }),
    ]);

    expect(result.total_runs).toBe(1);
    expect(result.successful_runs).toBe(1);
    expect(result.failed_runs).toBe(0);
    expect(result.success_rate).toBe(100);
    expect(result.avg_duration_ms).toBe(4200);
  });

  it("should return correct stats for a single failed metric", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", { success: false }),
    ]);

    expect(result.total_runs).toBe(1);
    expect(result.successful_runs).toBe(0);
    expect(result.failed_runs).toBe(1);
    expect(result.success_rate).toBe(0);
  });

  it("should compute correct mixed success rate", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", { success: true }),
      createMockMetrics("r2", { success: true }),
      createMockMetrics("r3", { success: false }),
      createMockMetrics("r4", { success: true }),
    ]);

    expect(result.total_runs).toBe(4);
    expect(result.successful_runs).toBe(3);
    expect(result.failed_runs).toBe(1);
    expect(result.success_rate).toBe(75);
  });

  it("should compute average phase timings", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", {
        phase_timings: {
          init: 10,
          discover: 200,
          normalize: 0,
          dedupe: 0,
          validate: 0,
          score: 0,
          stage: 0,
          publish: 0,
          verify: 0,
          finalize: 0,
        },
      }),
      createMockMetrics("r2", {
        phase_timings: {
          init: 30,
          discover: 100,
          normalize: 0,
          dedupe: 0,
          validate: 0,
          score: 0,
          stage: 0,
          publish: 0,
          verify: 0,
          finalize: 0,
        },
      }),
    ]);

    expect(result.avg_phase_timings.init).toBe(20);
    expect(result.avg_phase_timings.discover).toBe(150);
  });

  it("should average deals_processed across runs", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", {
        deals_processed: {
          discovered: 100,
          passed_trust_filter: 50,
          normalized: 40,
          deduped: 30,
          validated: 20,
          scored: 10,
          published: 5,
        },
      }),
      createMockMetrics("r2", {
        deals_processed: {
          discovered: 200,
          passed_trust_filter: 100,
          normalized: 80,
          deduped: 60,
          validated: 40,
          scored: 20,
          published: 10,
        },
      }),
    ]);

    expect(result.avg_deals_per_run.discovered).toBe(150);
    expect(result.avg_deals_per_run.published).toBe(8);
  });

  it("should aggregate validation gate rejections across runs", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", {
        validation_gate_rejections: { url_format: 3, trust_score: 1 },
      }),
      createMockMetrics("r2", {
        validation_gate_rejections: { url_format: 2, dedup: 4 },
      }),
    ]);

    const rejections = result.total_validation_gate_rejections;
    expect(rejections.url_format).toBe(5);
    expect(rejections.trust_score).toBe(1);
    expect(rejections.dedup).toBe(4);
  });

  it("should aggregate validation gate passes across runs", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", {
        validation_gate_passes: { url_format: 97, trust_score: 99 },
      }),
      createMockMetrics("r2", {
        validation_gate_passes: { url_format: 98 },
      }),
    ]);

    const passes = result.total_validation_gate_passes;
    expect(passes.url_format).toBe(195);
    expect(passes.trust_score).toBe(99);
  });

  it("should sum errors and retries across runs", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", { errors: 3, retries: 2 }),
      createMockMetrics("r2", { errors: 1, retries: 0 }),
    ]);

    expect(result.total_errors).toBe(4);
    expect(result.total_retries).toBe(2);
  });

  it("should average validation cache metrics", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", {
        validation_cache: {
          hit_total: 10,
          miss_total: 2,
          write_total: 4,
          d1_lookup_total: 1,
          dedup_hit_total: 3,
        },
      }),
      createMockMetrics("r2", {
        validation_cache: {
          hit_total: 20,
          miss_total: 4,
          write_total: 6,
          d1_lookup_total: 3,
          dedup_hit_total: 5,
        },
      }),
    ]);

    expect(result.avg_validation_cache.hit_total).toBe(15);
    expect(result.avg_validation_cache.miss_total).toBe(3);
  });

  it("should handle metrics without validation_cache gracefully", () => {
    const result = calculateAggregateStats([
      createMockMetrics("r1", { validation_cache: undefined }),
    ]);

    expect(result.avg_validation_cache.hit_total).toBe(0);
    expect(result.avg_validation_cache.miss_total).toBe(0);
  });
});

describe("formatMetricsForPrometheus", () => {
  it("should produce basic HELP/TYPE/metric lines for empty metrics", () => {
    const stats = calculateAggregateStats([]);
    const output = formatMetricsForPrometheus(stats);

    expect(output).toContain("# HELP deals_pipeline_runs_total");
    expect(output).toContain("# TYPE deals_pipeline_runs_total counter");
    expect(output).toContain("deals_pipeline_runs_total 0");
    expect(output).toContain("deals_pipeline_success_rate 0");
    expect(output).toContain("deals_pipeline_errors_total 0");
    expect(output).toContain("deals_pipeline_retries_total 0");
  });

  it("should include fallback phase timings from avg_phase_timings when no metrics provided", () => {
    const stats = calculateAggregateStats([
      createMockMetrics("r1", {
        phase_timings: {
          init: 42,
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
      }),
    ]);
    const output = formatMetricsForPrometheus(stats);

    expect(output).toContain(
      'deals_pipeline_phase_duration_ms{phase="init",status="success",quantile="0.5"} 42',
    );
  });

  it("should include detailed phase timing labels when metrics are provided", () => {
    const metrics = [
      createMockMetrics("r1", {
        phase_timings: {
          init: 10,
          discover: 200,
          normalize: 0,
          dedupe: 0,
          validate: 0,
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
          validate: "success",
          score: "success",
          stage: "success",
          publish: "success",
          verify: "success",
          finalize: "success",
        },
      }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics);

    expect(output).toContain(
      'deals_pipeline_phase_duration_ms{phase="init",status="success",quantile="0.5"}',
    );
    expect(output).toContain(
      'deals_pipeline_phase_duration_ms_avg{phase="init",status="success"} 10',
    );
    expect(output).toContain(
      'deals_pipeline_phase_duration_ms_max{phase="init",status="success"} 10',
    );
  });

  it("should skip phase timing groups with max=0", () => {
    const metrics = [
      createMockMetrics("r1", {
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
      }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics);

    // Should not have phase duration lines for max=0 groups
    expect(output).not.toContain('phase="init",status="success"');
    expect(output).not.toContain('phase="init",status="failure"');
  });

  it("should include total duration quantiles for success and failure", () => {
    const metrics = [
      createMockMetrics("r1", { success: true, total_duration_ms: 1000 }),
      createMockMetrics("r2", { success: true, total_duration_ms: 3000 }),
      createMockMetrics("r3", { success: false, total_duration_ms: 2000 }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics);

    expect(output).toContain(
      'deals_pipeline_total_duration_ms{status="success",quantile="0.5"}',
    );
    expect(output).toContain(
      'deals_pipeline_total_duration_ms{status="failure",quantile="0.5"}',
    );
  });

  it("should include stage_latency_ms for discover, validate, publish", () => {
    const metrics = [
      createMockMetrics("r1", {
        phase_timings: {
          init: 0,
          discover: 200,
          normalize: 0,
          dedupe: 0,
          validate: 100,
          score: 0,
          stage: 0,
          publish: 50,
          verify: 0,
          finalize: 0,
        },
      }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics);

    expect(output).toContain(
      "# HELP stage_latency_ms Latency per pipeline stage",
    );
    expect(output).toContain(
      'stage_latency_ms{stage="discovery",percentile="p50"}',
    );
    expect(output).toContain(
      'stage_latency_ms{stage="validation",percentile="p50"}',
    );
    expect(output).toContain(
      'stage_latency_ms{stage="publish",percentile="p50"}',
    );
  });

  it("should include deals processed averages", () => {
    const stats = calculateAggregateStats([createMockMetrics("r1")]);
    const output = formatMetricsForPrometheus(stats);

    expect(output).toContain('deals_pipeline_deals_avg{stage="discovered"}');
    expect(output).toContain('deals_pipeline_deals_avg{stage="published"}');
  });

  it("should include validation cache averages", () => {
    const stats = calculateAggregateStats([createMockMetrics("r1")]);
    const output = formatMetricsForPrometheus(stats);

    expect(output).toContain('deals_validation_cache_avg{type="hit_total"}');
  });

  it("should include errors and retries totals", () => {
    const stats = calculateAggregateStats([
      createMockMetrics("r1", { errors: 2, retries: 1 }),
    ]);
    const output = formatMetricsForPrometheus(stats);

    expect(output).toContain("deals_pipeline_errors_total 2");
    expect(output).toContain("deals_pipeline_retries_total 1");
  });

  it("should expose validation gate rejections with HELP/TYPE", () => {
    const metrics = [
      createMockMetrics("r1", {
        validation_gate_rejections: { url_format: 3 },
      }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics);

    expect(output).toContain("# HELP validation_gate_rejections");
    expect(output).toContain("# TYPE validation_gate_rejections counter");
    expect(output).toContain('validation_gate_rejections{gate="url_format"} 3');
  });

  it("should expose validation gate passes with rejection ratios", () => {
    const metrics = [
      createMockMetrics("r1", {
        validation_gate_passes: { url_format: 97 },
        validation_gate_rejections: { url_format: 3 },
      }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics);

    expect(output).toContain("# HELP validation_gate_passes");
    expect(output).toContain('validation_gate_passes{gate="url_format"} 97');
    expect(output).toContain("# HELP validation_gate_rejection_ratio");
    expect(output).toContain(
      'validation_gate_rejection_ratio{gate="url_format"} 0.0300',
    );
  });

  it("should merge cumulative rejections with stats-level rejections", () => {
    const metrics = [
      createMockMetrics("r1", {
        validation_gate_rejections: { url_format: 2 },
      }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics, {
      url_format: 10,
      trust_score: 5,
    });

    expect(output).toContain(
      'validation_gate_rejections{gate="url_format"} 10',
    );
    expect(output).toContain(
      'validation_gate_rejections{gate="trust_score"} 5',
    );
  });

  it("should handle rejection ratio when gate has no passes", () => {
    const metrics = [
      createMockMetrics("r1", {
        validation_gate_rejections: { url_format: 5 },
      }),
    ];
    const stats = calculateAggregateStats(metrics);
    const output = formatMetricsForPrometheus(stats, metrics);

    // No passes means ratio is not calculated (no passes section triggers ratio calc)
    expect(output).not.toContain("validation_gate_rejection_ratio");
  });

  it("should output newline-separated lines", () => {
    const stats = calculateAggregateStats([]);
    const output = formatMetricsForPrometheus(stats);

    const lines = output.split("\n");
    expect(lines.length).toBeGreaterThan(10);
    expect(lines[0]).toContain("# HELP");
  });
});

describe("getDetailedPhaseTimingStats", () => {
  it("should return all-zeros for empty metrics", () => {
    const result = getDetailedPhaseTimingStats([]);

    const initSuccess = result.init.success;
    expect(initSuccess.min).toBe(0);
    expect(initSuccess.max).toBe(0);
    expect(initSuccess.avg).toBe(0);
  });

  it("should compute success stats for a single metric", () => {
    const metrics = [
      createMockMetrics("r1", {
        phase_timings: {
          init: 42,
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
      }),
    ];
    const result = getDetailedPhaseTimingStats(metrics);

    const initSuccess = result.init.success;
    expect(initSuccess.min).toBe(42);
    expect(initSuccess.max).toBe(42);
    expect(initSuccess.avg).toBe(42);
    expect(initSuccess.p50).toBe(42);
  });

  it("should separate success and failure stats per phase", () => {
    const metrics = [
      createMockMetrics("r1", {
        success: true,
        phase_timings: {
          init: 10,
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
      }),
      createMockMetrics("r2", {
        success: false,
        phase_timings: {
          init: 100,
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
        phase_results: {
          init: "failure",
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
      }),
    ];
    const result = getDetailedPhaseTimingStats(metrics);

    expect(result.init.success.max).toBe(10);
    expect(result.init.failure.max).toBe(100);
  });
});

describe("getPhaseTimingStats", () => {
  it("should return all phases with zeros for empty metrics", () => {
    const result = getPhaseTimingStats([]);

    expect(result.init).toBeDefined();
    expect(result.init.min).toBe(0);
    expect(result.init.max).toBe(0);
    expect(result.init.avg).toBe(0);
    expect(result.init.p95).toBe(0);
  });

  it("should return correct stats for a single metric", () => {
    const metrics = [
      createMockMetrics("r1", {
        phase_timings: {
          init: 15,
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
      }),
    ];
    const result = getPhaseTimingStats(metrics);

    expect(result.init.min).toBe(15);
    expect(result.init.max).toBe(15);
    expect(result.init.avg).toBe(15);
    expect(result.init.p95).toBe(15);
  });

  it("should combine timings from all metrics per phase", () => {
    const metrics = [
      createMockMetrics("r1", {
        phase_timings: {
          init: 10,
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
      }),
      createMockMetrics("r2", {
        phase_timings: {
          init: 30,
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
      }),
    ];
    const result = getPhaseTimingStats(metrics);

    expect(result.init.min).toBe(10);
    expect(result.init.max).toBe(30);
    expect(result.init.avg).toBe(20);
    expect(result.init.p95).toBe(30);
  });

  it("should filter out zero timings", () => {
    const metrics = [
      createMockMetrics("r1", {
        phase_timings: {
          init: 0,
          discover: 0,
          normalize: 0,
          dedupe: 0,
          validate: 0,
          score: 0,
          stage: 0,
          publish: 100,
          verify: 0,
          finalize: 0,
        },
      }),
    ];
    const result = getPhaseTimingStats(metrics);

    expect(result.init.max).toBe(0);
    expect(result.publish.avg).toBe(100);
  });
});

describe("getCumulativeGateRejections", () => {
  let kvStore: Map<string, string>;
  let env: Env;

  beforeEach(() => {
    kvStore = new Map();
    env = createMockEnv(kvStore);
  });

  it("should return empty object when KV has no data", async () => {
    const result = await getCumulativeGateRejections(env);
    expect(result).toEqual({});
  });

  it("should return parsed rejections when KV has data", async () => {
    kvStore.set(
      "metrics:cumulative_gate_rejections",
      JSON.stringify({ url_format: 10, trust_score: 5 }),
    );
    const result = await getCumulativeGateRejections(env);
    expect(result).toEqual({ url_format: 10, trust_score: 5 });
  });
});

describe("getCumulativeGatePasses", () => {
  let kvStore: Map<string, string>;
  let env: Env;

  beforeEach(() => {
    kvStore = new Map();
    env = createMockEnv(kvStore);
  });

  it("should return empty object when KV has no data", async () => {
    const result = await getCumulativeGatePasses(env);
    expect(result).toEqual({});
  });

  it("should return parsed passes when KV has data", async () => {
    kvStore.set(
      "metrics:cumulative_gate_passes",
      JSON.stringify({ url_format: 200 }),
    );
    const result = await getCumulativeGatePasses(env);
    expect(result).toEqual({ url_format: 200 });
  });
});
