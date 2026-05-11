import { describe, it, expect } from "vitest";
import { validatePriceSanity } from "../../../worker/validation/gates/price-sanity";
import { Deal } from "../../../worker/types";
import { CONFIG } from "../../../worker/config";

describe("price-sanity gate", () => {
  it("should pass for reasonable reward", () => {
    const deal: Deal = {
      reward: { type: "cash", value: 50 },
    } as any;
    const result = validatePriceSanity(deal);
    expect(result.passed).toBe(true);
  });

  it("should fail for negative reward", () => {
    const deal: Deal = {
      reward: { type: "cash", value: -10 },
    } as any;
    const result = validatePriceSanity(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("Negative reward value");
  });

  it("should fail for suspiciously high cash reward", () => {
    const deal: Deal = {
      reward: { type: "cash", value: CONFIG.MAX_REWARD_VALUE + 1 },
    } as any;
    const result = validatePriceSanity(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("exceeds maximum");
  });

  it("should fail for percent reward over 100%", () => {
    const deal: Deal = {
      reward: { type: "percent", value: 101 },
    } as any;
    const result = validatePriceSanity(deal);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("exceeds 100%");
  });
});
