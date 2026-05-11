import { Deal, DealSchema } from "../../types";
import { GateResult } from "../types";

/**
 * Gate 1: Schema Validation
 */
export function validateSchema(deal: Deal): GateResult {
  const result = DealSchema.safeParse(deal);
  if (result.success) {
    return { passed: true };
  }
  return {
    passed: false,
    reason: `Schema validation failed: ${result.error.errors.map((e) => e.message).join(", ")}`,
  };
}
