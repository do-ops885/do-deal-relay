import { describe, it, expect } from "vitest";
import { validateFreshness } from "../../../worker/validation/gates/freshness";
import { Deal } from "../../../worker/types";

describe("freshness gate", () => {
  it("should pass if no expiry date", () => {
    const deal: Deal = {
      expiry: { type: "unknown", confidence: 0 },
    } as any;
    const result = validateFreshness(deal);
    expect(result.passed).toBe(true);
  });

  it("should pass if expiry date is in the future", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const deal: Deal = {
      expiry: { date: futureDate.toISOString(), type: "hard", confidence: 1 },
    } as any;
    const result = validateFreshness(deal);
    expect(result.passed).toBe(true);
  });

  it("should fail if expiry date is in the past", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const deal: Deal = {
      expiry: { date: pastDate.toISOString(), type: "hard", confidence: 1 },
    } as any;
    const result = validateFreshness(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Deal expired on");
  });
});
