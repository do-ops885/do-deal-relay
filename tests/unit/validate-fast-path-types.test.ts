import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for validateDealFastPath type handling.
 * Verifies that the `metrics?: unknown` parameter is correctly narrowed
 * using a runtime type guard before being cast to PipelineMetrics.
 */

// --- Type guard under test (replicating the one from validate-fast-path.ts) ---

interface PipelineMetrics {
  run_id: string;
  start_time: number;
  end_time?: number;
  phase_timings: Record<string, number>;
  phase_results: Record<string, "success" | "failure">;
  total_duration_ms: number;
  deals_processed: {
    discovered: number;
    passed_trust_filter: number;
    normalized: number;
    deduped: number;
    validated: number;
    scored: number;
    published: number;
  };
  validation_cache?: {
    hit_total: number;
    miss_total: number;
    write_total: number;
    d1_lookup_total: number;
    dedup_hit_total: number;
  };
  validation_gate_rejections?: Record<string, number>;
  validation_gate_passes?: Record<string, number>;
  errors: number;
  retries: number;
  success: boolean;
}

function isPipelineMetrics(value: unknown): value is PipelineMetrics {
  return (
    typeof value === "object" &&
    value !== null &&
    "run_id" in value &&
    typeof (value as Record<string, unknown>).run_id === "string" &&
    "start_time" in value &&
    typeof (value as Record<string, unknown>).start_time === "number" &&
    "success" in value &&
    typeof (value as Record<string, unknown>).success === "boolean"
  );
}

describe("isPipelineMetrics type guard", () => {
  it("should return true for a valid PipelineMetrics object", () => {
    const valid: PipelineMetrics = {
      run_id: "run-1",
      start_time: Date.now(),
      phase_timings: {},
      phase_results: {},
      total_duration_ms: 100,
      deals_processed: {
        discovered: 5,
        passed_trust_filter: 4,
        normalized: 3,
        deduped: 2,
        validated: 2,
        scored: 1,
        published: 1,
      },
      errors: 0,
      retries: 0,
      success: true,
    };
    expect(isPipelineMetrics(valid)).toBe(true);
  });

  it("should return false for null", () => {
    expect(isPipelineMetrics(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isPipelineMetrics(undefined)).toBe(false);
  });

  it("should return false for a plain string", () => {
    expect(isPipelineMetrics("not metrics")).toBe(false);
  });

  it("should return false for an object missing run_id", () => {
    const partial = {
      start_time: Date.now(),
      success: true,
    };
    expect(isPipelineMetrics(partial)).toBe(false);
  });

  it("should return false for an object with run_id of wrong type", () => {
    const wrongType = {
      run_id: 42,
      start_time: Date.now(),
      success: true,
    };
    expect(isPipelineMetrics(wrongType)).toBe(false);
  });

  it("should return false for an object missing start_time", () => {
    const partial = {
      run_id: "run-1",
      success: true,
    };
    expect(isPipelineMetrics(partial)).toBe(false);
  });

  it("should return false for an object with start_time of wrong type", () => {
    const wrongType = {
      run_id: "run-1",
      start_time: "not-a-number",
      success: true,
    };
    expect(isPipelineMetrics(wrongType)).toBe(false);
  });

  it("should return false for an object missing success", () => {
    const partial = {
      run_id: "run-1",
      start_time: Date.now(),
    };
    expect(isPipelineMetrics(partial)).toBe(false);
  });

  it("should return false for an empty object", () => {
    expect(isPipelineMetrics({})).toBe(false);
  });
});

describe("validateDealFastPath metrics handling", () => {
  // Simulates the consolidated metrics recording pattern
  function recordMetrics(metrics: unknown): void {
    if (!isPipelineMetrics(metrics)) return;
    // After type guard, metrics is narrowed to PipelineMetrics
    if (!metrics.validation_cache) {
      metrics.validation_cache = {
        hit_total: 0,
        miss_total: 0,
        write_total: 0,
        d1_lookup_total: 0,
        dedup_hit_total: 0,
      };
    }
    metrics.validation_cache.hit_total += 1;
    metrics.validation_cache.dedup_hit_total += 1;
  }

  it("should safely skip recording when metrics is undefined", () => {
    expect(() => recordMetrics(undefined)).not.toThrow();
  });

  it("should safely skip recording when metrics is null", () => {
    expect(() => recordMetrics(null)).not.toThrow();
  });

  it("should safely skip recording when metrics is a string", () => {
    expect(() => recordMetrics("not metrics")).not.toThrow();
  });

  it("should record metrics when given a valid PipelineMetrics object", () => {
    const metrics: PipelineMetrics = {
      run_id: "run-test",
      start_time: Date.now(),
      phase_timings: {},
      phase_results: {},
      total_duration_ms: 0,
      deals_processed: {
        discovered: 0,
        passed_trust_filter: 0,
        normalized: 0,
        deduped: 0,
        validated: 0,
        scored: 0,
        published: 0,
      },
      errors: 0,
      retries: 0,
      success: false,
    };
    recordMetrics(metrics);
    expect(metrics.validation_cache).toBeDefined();
    expect(metrics.validation_cache!.hit_total).toBe(1);
    expect(metrics.validation_cache!.dedup_hit_total).toBe(1);
  });
});
