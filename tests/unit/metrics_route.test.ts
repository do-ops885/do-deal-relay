import { describe, it, expect, vi } from "vitest";
import { handleMetrics } from "../../worker/routes/core/health";
import { Env } from "../../worker/types";

// Mock dependencies
vi.mock("../../worker/lib/storage", () => ({
  getProductionSnapshot: vi.fn().mockResolvedValue({
    stats: { active: 42 },
  }),
}));

vi.mock("../../worker/lib/metrics/core", () => ({
  getRecentMetrics: vi.fn().mockResolvedValue([
    {
      run_id: "test-run",
      start_time: Date.now(),
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
      total_duration_ms: 100,
      deals_processed: {
        discovered: 10,
        normalized: 10,
        deduped: 10,
        validated: 10,
        scored: 10,
        published: 10,
      },
      validation_gates: {
        schema_validation: { passed: 10, failed: 0 },
      },
      errors: 0,
      retries: 0,
      success: true,
      final_phase: "finalize",
    },
  ]),
}));

describe("Metrics Route Handler", () => {
  const mockEnv = {
    DEALS_PROD: {},
    DEALS_LOG: {},
    ENVIRONMENT: "test",
  } as unknown as Env;

  it("should return prometheus metrics by default", async () => {
    const response = await handleMetrics(mockEnv, "prometheus");
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(text).toContain("deals_pipeline_runs_total 1");
    expect(text).toContain(
      'deals_pipeline_validation_gate_passed_avg{gate="schema_validation"} 10',
    );
    expect(text).toContain("deals_active_deals 42");
  });

  it("should return json metrics when requested", async () => {
    const response = await handleMetrics(mockEnv, "json");
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(json.summary.total_runs).toBe(1);
    expect(json.validation_gates.schema_validation.passed).toBe(10);
    expect(json.deals.active).toBe(42);
  });
});
