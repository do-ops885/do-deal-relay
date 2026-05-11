import { describe, it, expect } from "vitest";
import { validateTrustScore } from "../../../worker/validation/gates/trust-score";
import { Deal, Env } from "../../../worker/types";

describe("trust-score gate", () => {
  const deal: Deal = {
    source: {
      trust_score: 0.5,
    },
  } as any;

  const env: Env = {
    TRUST_THRESHOLD: "0.3",
  } as any;

  it("should pass if trust score is above threshold", () => {
    const result = validateTrustScore(deal, env);
    expect(result.passed).toBe(true);
  });

  it("should fail if trust score is below threshold", () => {
    const lowTrustDeal = {
      ...deal,
      source: { trust_score: 0.1 },
    } as any;
    const result = validateTrustScore(lowTrustDeal, env);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("below minimum");
  });
});
