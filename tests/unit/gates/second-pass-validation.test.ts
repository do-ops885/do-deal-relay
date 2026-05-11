import { describe, it, expect } from "vitest";
import { validateSecondPass } from "../../../worker/validation/gates/second-pass-validation";
import { Deal } from "../../../worker/types";

describe("second-pass-validation gate", () => {
  const validDeal: Deal = {
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

  it("should pass a valid deal", () => {
    const result = validateSecondPass(validDeal);
    expect(result.passed).toBe(true);
  });

  it("should fail if code is too short", () => {
    const deal = { ...validDeal, code: "ABC" };
    const result = validateSecondPass(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("Code too short after normalization");
  });

  it("should fail if code is too long", () => {
    const deal = { ...validDeal, code: "A".repeat(51) };
    const result = validateSecondPass(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("Code too long after normalization");
  });
});
