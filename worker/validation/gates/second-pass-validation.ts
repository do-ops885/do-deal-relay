import { Deal, DealSchema } from "../../types";
import { GateResult } from "../types";

/**
 * Gate 7: Second-Pass Validation
 */
export function validateSecondPass(deal: Deal): GateResult {
  // Re-run schema validation on normalized data
  const result = DealSchema.safeParse(deal);

  if (!result.success) {
    return {
      passed: false,
      reason: `Second-pass validation failed: ${result.error.errors[0].message}`,
    };
  }

  // Additional checks on normalized data
  if (deal.code.length < 4) {
    return { passed: false, reason: "Code too short after normalization" };
  }

  if (deal.code.length > 50) {
    return { passed: false, reason: "Code too long after normalization" };
  }

  return { passed: true };
}
