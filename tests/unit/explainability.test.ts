import { describe, it, expect } from "vitest";
import { explainDeal } from "../../worker/lib/explainability";
import { Deal } from "../../worker/types";

describe("Deal Explainability", () => {
  const mockDeal: any = {
    id: "test-deal",
    source: {
      url: "https://example.com/deal",
      domain: "example.com",
      discovered_at: new Date().toISOString(),
      trust_score: 1.0,
    },
    title: "Test Deal",
    description: "A test deal",
    code: "TESTCODE",
    url: "https://example.com/deal",
    reward: {
      type: "cash",
      value: 500,
      currency: "USD",
    },
    expiry: {
      confidence: 1.0,
      type: "hard",
    },
    metadata: {
      category: ["shopping"],
      tags: ["test"],
      normalized_at: new Date().toISOString(),
      confidence_score: 1.0,
      status: "active",
    },
  };

  it("should generate a high-quality explanation for a good deal", () => {
    const explanation = explainDeal(mockDeal as Deal);
    expect(explanation.deal_id).toBe("test-deal");
    expect(explanation.status).toBe("active");
    expect(explanation.summary).toContain("high-quality");
    expect(explanation.factors.scoring.total).toBeGreaterThan(0.8);
  });

  it("should handle rejected deals correctly", () => {
    const rejectedDeal = {
      ...mockDeal,
      metadata: { ...mockDeal.metadata, status: "rejected" as const },
    };
    const explanation = explainDeal(rejectedDeal as Deal);
    expect(explanation.status).toBe("rejected");
    expect(explanation.summary).toContain("rejected");
  });

  it("should handle quarantined deals correctly", () => {
    const quarantinedDeal = {
      ...mockDeal,
      metadata: { ...mockDeal.metadata, status: "quarantined" as const },
    };
    const explanation = explainDeal(quarantinedDeal as Deal);
    expect(explanation.status).toBe("quarantined");
    expect(explanation.summary).toContain("quarantined");
  });

  it("should read validation gate results from deal metadata", () => {
    const dealWithGates = {
      ...mockDeal,
      metadata: {
        ...mockDeal.metadata,
        validation_gates: {
          passed: ["schema_validation", "source_trust", "reward_plausibility"],
          failed: ["expiry_validation"],
          timestamp: new Date().toISOString(),
        },
      },
    };
    const explanation = explainDeal(dealWithGates as Deal);
    expect(explanation.factors.validation.passed).toEqual([
      "schema_validation",
      "source_trust",
      "reward_plausibility",
    ]);
    expect(explanation.factors.validation.failed).toEqual([
      "expiry_validation",
    ]);
  });

  it("should return empty arrays when validation_gates is absent", () => {
    const explanation = explainDeal(mockDeal as Deal);
    expect(explanation.factors.validation.passed).toEqual([]);
    expect(explanation.factors.validation.failed).toEqual([]);
  });
});
