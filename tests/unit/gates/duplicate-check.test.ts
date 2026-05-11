import { describe, it, expect } from "vitest";
import { checkDeduplication } from "../../../worker/validation/gates/duplicate-check";
import { Deal, PipelineContext } from "../../../worker/types";

describe("duplicate-check gate", () => {
  const deal: Deal = {
    id: "test-id",
    source: {
      url: "https://example.com",
      domain: "example.com",
      discovered_at: new Date().toISOString(),
      trust_score: 0.8,
    },
    title: "Test Deal",
    description: "A test deal description",
    code: "TESTCODE",
    url: "https://example.com/test",
    reward: {
      type: "cash",
      value: 10,
    },
    expiry: {
      confidence: 1,
      type: "unknown",
    },
    metadata: {
      category: ["test"],
      tags: ["test"],
      normalized_at: new Date().toISOString(),
      confidence_score: 1,
      status: "active",
    },
  };

  it("should pass if no duplicates in context", () => {
    const ctx: PipelineContext = {
      validated: [],
    } as any;
    const result = checkDeduplication(deal, ctx);
    expect(result.passed).toBe(true);
  });

  it("should fail if duplicate ID exists in context", () => {
    const ctx: PipelineContext = {
      validated: [{ ...deal, id: "test-id" }],
    } as any;
    const result = checkDeduplication(deal, ctx);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Duplicate detected");
  });

  it("should fail if duplicate domain and code exists in context", () => {
    const ctx: PipelineContext = {
      validated: [{ ...deal, id: "other-id" }],
    } as any;
    const result = checkDeduplication(deal, ctx);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Duplicate detected");
  });
});
