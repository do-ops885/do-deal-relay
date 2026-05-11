import { Deal } from "../../types";
import { GateResult } from "../types";

/**
 * Gate 8: Idempotency Check
 */
export function checkIdempotency(
  deal: Deal,
  existingIds: Set<string>,
): GateResult {
  if (existingIds.has(deal.id)) {
    return {
      passed: false,
      reason: "Deal already exists in production snapshot",
    };
  }

  return { passed: true };
}
