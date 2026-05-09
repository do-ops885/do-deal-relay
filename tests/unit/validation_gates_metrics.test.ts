import { describe, it, expect } from "vitest";
import { VALIDATION_GATES } from "../../worker/config";
import { validate } from "../../worker/pipeline/validate";
import { createMetrics } from "../../worker/lib/metrics/core";
import {
  calculateAggregateStats,
  formatMetricsForPrometheus,
} from "../../worker/lib/metrics/stats";
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
    expect(ctx.metrics?.validation_gate_passes?.["schema_validation"]).toBe(1);

    // Verify aggregation and prometheus formatting
    const stats = calculateAggregateStats([ctx.metrics!]);
    expect(stats.total_validation_gate_rejections["source_trust"]).toBe(1);
    expect(stats.total_validation_gate_passes["schema_validation"]).toBe(1);

    const prometheus = formatMetricsForPrometheus(stats);
    expect(prometheus).toContain(
      'validation_gate_rejections{gate="source_trust"} 1',
    );
    expect(prometheus).toContain(
      'validation_gate_passes{gate="schema_validation"} 1',
    );
    expect(prometheus).toContain(
      'validation_gate_rejection_ratio{gate="schema_validation"} 0.0000',
    );
    expect(prometheus).toContain(
      'validation_gate_rejection_ratio{gate="source_trust"} 1.0000',
    );

    expect(prometheus).toContain("# HELP validation_gate_rejections");
    expect(prometheus).toContain("# TYPE validation_gate_rejections counter");
    expect(prometheus).toContain("# HELP validation_gate_passes");
    expect(prometheus).toContain("# TYPE validation_gate_passes counter");
    expect(prometheus).toContain("# HELP validation_gate_rejection_ratio");
    expect(prometheus).toContain(
      "# TYPE validation_gate_rejection_ratio gauge",
    );
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

  it("should handle multi-gate rejection scenarios", async () => {
    const mockDeals: Deal[] = [
      {
        id: "deal-multi-fail",
        source: {
          url: "https://EXAMPLE.COM/ref=test", // Fails normalization (uppercase + tracking param)
          domain: "EXAMPLE.COM",
          discovered_at: new Date().toISOString(),
          trust_score: 0.1, // Fails source_trust
        },
        title: "", // Fails schema_validation
        description: "Test Description",
        code: "test", // Fails normalization (not uppercase)
        url: "https://example.com/ref=test",
        reward: { type: "cash", value: -10 }, // Fails reward_plausibility
        expiry: {
          date: "2020-01-01T00:00:00Z", // Fails expiry_validation
          confidence: 1,
          type: "hard",
        },
        metadata: {
          category: ["test"],
          tags: ["test"],
          normalized_at: "", // Fails normalization
          confidence_score: 1,
          status: "active",
        },
      },
    ];

    const ctx: PipelineContext = {
      run_id: "test-multi-fail-run",
      trace_id: "test-multi-fail-trace",
      start_time: Date.now(),
      candidates: mockDeals,
      normalized: mockDeals,
      deduped: mockDeals,
      validated: [],
      scored: [],
      metrics: createMetrics("test-multi-fail-run"),
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

    // Should have multiple gate failures
    const failures = ctx.metrics?.validation_gate_rejections;
    expect(failures!["schema_validation"]).toBe(1);
    expect(failures!["normalization_verification"]).toBe(1);
    expect(failures!["source_trust"]).toBe(1);
    expect(failures!["reward_plausibility"]).toBe(1);
    expect(failures!["expiry_validation"]).toBe(1);

    // Verify aggregate stats
    const stats = calculateAggregateStats([ctx.metrics!]);
    expect(stats.total_validation_gate_rejections["schema_validation"]).toBe(1);
    expect(stats.total_validation_gate_rejections["source_trust"]).toBe(1);

    const prometheus = formatMetricsForPrometheus(stats);
    expect(prometheus).toContain(
      'validation_gate_rejections{gate="schema_validation"} 1',
    );
    expect(prometheus).toContain(
      'validation_gate_rejections{gate="source_trust"} 1',
    );
  });
});
