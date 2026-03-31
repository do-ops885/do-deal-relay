import { describe, it, expect } from "vitest";
import {
  deduplicate,
  calculateSourceDiversity,
  calculateUniquenessScore,
} from "../../worker/pipeline/dedupe";
import type { Deal, PipelineContext } from "../../worker/types";

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: `https://${overrides.source?.domain || "example.com"}/invite`,
    domain: overrides.source?.domain || "example.com",
    discovered_at: "2024-03-31T00:00:00Z",
    trust_score: 0.7,
  },
  title: "Test Deal",
  description: "Test description",
  code: overrides.code || "CODE123",
  url: `https://${overrides.source?.domain || "example.com"}/invite/${overrides.code || "CODE123"}`,
  reward: {
    type: "cash",
    value: 50,
    currency: "USD",
  },
  expiry: {
    confidence: 0.8,
    type: "soft",
  },
  metadata: {
    category: ["test"],
    tags: ["test"],
    normalized_at: "2024-03-31T00:00:00Z",
    confidence_score: 0.8,
    status: "active",
  },
});

describe("Deduplication Pipeline", () => {
  const ctx: PipelineContext = {
    run_id: "test-run",
    trace_id: "test-trace",
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0,
  };

  it("should remove duplicate codes", () => {
    const deals = [
      createMockDeal("1", { code: "CODE123" }),
      createMockDeal("2", { code: "CODE123" }),
    ];
    const result = deduplicate(deals, ctx);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it("should keep different codes", () => {
    const deals = [
      createMockDeal("1", { code: "CODE123" }),
      createMockDeal("2", { code: "CODE456" }),
    ];
    const result = deduplicate(deals, ctx);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("should calculate source diversity", () => {
    const deals = [
      createMockDeal("1", { source: { domain: "example1.com" } }),
      createMockDeal("2", { source: { domain: "example2.com" } }),
      createMockDeal("3", { source: { domain: "example1.com" } }),
    ];
    const diversity = calculateSourceDiversity(deals);
    expect(diversity).toBeGreaterThan(0);
    expect(diversity).toBeLessThanOrEqual(1);
  });

  it("should calculate uniqueness score", () => {
    const score = calculateUniquenessScore(2, 10);
    expect(score).toBe(0.8);
  });
});
