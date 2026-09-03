import { describe, it, expect } from "vitest";
import { validate } from "../../worker/validation/pipeline";
import { calculateAggregateStats } from "../../worker/lib/metrics/stats";
import { createMetrics } from "../../worker/lib/metrics/core";
import { Deal, Env, PipelineContext } from "../../worker/types";

describe("Funnel Instrumentation & Aggregation", () => {
  const mockDeals: Deal[] = [
    {
      id: "deal-1",
      source: {
        url: "https://example.com/1",
        domain: "example.com",
        discovered_at: new Date().toISOString(),
        trust_score: 0.8, // Passes trust
      },
      title: "Deal 1",
      description: "Desc 1",
      code: "CODE1",
      url: "https://example.com/1",
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
    {
      id: "deal-2",
      source: {
        url: "https://example.com/2",
        domain: "example.com",
        discovered_at: new Date().toISOString(),
        trust_score: 0.1, // Fails trust
      },
      title: "Deal 2",
      description: "Desc 2",
      code: "CODE2",
      url: "https://example.com/2",
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

  it("should correctly count passed_trust_filter during validation", async () => {
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
      TRUST_THRESHOLD: "0.3",
      DEALS_LOG: { get: async () => null, put: async () => {} },
      DEALS_PROD: { get: async () => null, put: async () => {} },
      DEALS_LOCK: { get: async () => null, put: async () => {} },
      DEALS_STAGING: { get: async () => null, put: async () => {} },
      DEALS_SOURCES: { get: async () => null, put: async () => {} },
    } as unknown as Env;

    await validate(mockDeals, ctx, env);

    expect(ctx.metrics?.deals_processed.passed_trust_filter).toBe(1);
    expect(ctx.metrics?.deals_processed.discovered).toBe(0); // validate doesn't set discovered, state-machine does
  });

  it("should correctly average passed_trust_filter in calculateAggregateStats", () => {
    const m1 = createMetrics("run-1");
    m1.deals_processed.passed_trust_filter = 10;
    m1.success = true;

    const m2 = createMetrics("run-2");
    m2.deals_processed.passed_trust_filter = 20;
    m2.success = true;

    const stats = calculateAggregateStats([m1, m2]);
    expect(stats.avg_deals_per_run.passed_trust_filter).toBe(15);
  });
});
