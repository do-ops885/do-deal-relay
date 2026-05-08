import { describe, it, expect } from "vitest";
import { VALIDATION_GATES } from "../../worker/config";
import { validate } from "../../worker/pipeline/validate";
import { createMetrics } from "../../worker/lib/metrics/core";
import { calculateAggregateStats, formatMetricsForPrometheus } from "../../worker/lib/metrics/stats";
import { Deal, Env, PipelineContext } from "../../worker/types";

describe("Validation Gates Metrics", () => {
  it("should record rejections per gate in metrics", async () => {
    const mockDeals: Deal[] = [
      {
        id: "deal-1",
        source: {
          url: "https://example.com",
          domain: "example.com",
          discovered_at: new Date().toISOString(),
          trust_score: 0, // Should fail source_trust
        },
        title: "Test Deal",
        description: "Test Description",
        code: "TESTCODE",
        url: "https://example.com/test",
        reward: { type: "cash", value: 10 },
        expiry: { confidence: 1, type: "hard" },
        metadata: {
          category: ["test"],
          tags: ["test"],
          normalized_at: new Date().toISOString(),
          confidence_score: 1,
          status: "active",
        },
      },
    ];

    const ctx: PipelineContext = {
      run_id: "test-run",
      trace_id: "test-trace",
      start_time: Date.now(),
      candidates: mockDeals,
      normalized: mockDeals,
      deduped: mockDeals,
      validated: [],
      scored: [],
      metrics: createMetrics("test-run"),
      errors: [],
      retry_count: 0,
    };

    const env = {
      ENABLE_VALIDATION_CACHE: "false",
      TRUST_THRESHOLD: "0.5",
      DEALS_LOG: {
        get: async () => null,
        put: async () => {},
      },
      DEALS_PROD: {
        get: async () => null,
        put: async () => {},
      },
    } as unknown as Env;

    const result = await validate(mockDeals, ctx, env);

    expect(result.stats.invalid).toBe(1);
    expect(result.stats.by_gate["source_trust"]).toBe(1);
    expect(ctx.metrics?.validation_gate_rejections?.["source_trust"]).toBe(1);

    // Verify aggregation and prometheus formatting
    const stats = calculateAggregateStats([ctx.metrics!]);
    expect(stats.total_validation_gate_rejections["source_trust"]).toBe(1);

    const prometheus = formatMetricsForPrometheus(stats);
    expect(prometheus).toContain('validation_gate_rejections{gate="source_trust"} 1');
    expect(prometheus).toContain('# HELP validation_gate_rejections');
    expect(prometheus).toContain('# TYPE validation_gate_rejections counter');
  });

  it("should have all 9 gates enumerated in VALIDATION_GATES", async () => {
    const gates = [
      "schema_validation",
      "normalization_verification",
      "deduplication_check",
      "source_trust",
      "reward_plausibility",
      "expiry_validation",
      "second_pass_validation",
      "idempotency_check",
      "snapshot_hash_verification",
    ];

    for (const gate of gates) {
      expect(VALIDATION_GATES).toContain(gate);
    }
    expect(VALIDATION_GATES.length).toBe(9);
  });
});
