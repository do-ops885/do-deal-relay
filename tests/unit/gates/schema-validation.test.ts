import { describe, it, expect } from "vitest";
import { validateSchema } from "../../../worker/validation/gates/schema-validation";
import { Deal } from "../../../worker/types";

describe("schema-validation gate", () => {
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
    const result = validateSchema(validDeal);
    expect(result.passed).toBe(true);
  });

  it("should fail an invalid deal", () => {
    const invalidDeal = { ...validDeal, title: "" } as any;
    const result = validateSchema(invalidDeal);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Schema validation failed");
  });
});
