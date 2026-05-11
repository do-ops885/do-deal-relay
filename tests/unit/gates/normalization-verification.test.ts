import { describe, it, expect } from "vitest";
import { verifyNormalization } from "../../../worker/validation/gates/normalization-verification";
import { Deal } from "../../../worker/types";

describe("normalization-verification gate", () => {
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

  it("should pass a correctly normalized deal", () => {
    const result = verifyNormalization(validDeal);
    expect(result.passed).toBe(true);
  });

  it("should fail if domain is not lowercase", () => {
    const deal = {
      ...validDeal,
      source: { ...validDeal.source, domain: "Example.Com" },
    };
    const result = verifyNormalization(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("domain not lowercase");
  });

  it("should fail if code is not uppercase", () => {
    const deal = { ...validDeal, code: "testcode" };
    const result = verifyNormalization(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("code not uppercase");
  });

  it("should fail if URL contains tracking parameters", () => {
    const deal = {
      ...validDeal,
      url: "https://example.com/test?utm_source=test",
    };
    const result = verifyNormalization(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("URL contains tracking parameter");
  });

  it("should fail if normalized_at is missing", () => {
    const deal = {
      ...validDeal,
      metadata: { ...validDeal.metadata, normalized_at: "" },
    };
    const result = verifyNormalization(deal as any);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("missing normalized_at timestamp");
  });
});
