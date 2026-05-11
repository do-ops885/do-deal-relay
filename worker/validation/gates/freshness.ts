import { Deal } from "../../types";
import { GateResult } from "../types";

/**
 * Gate 6: Expiry Validation (Freshness)
 */
export function validateFreshness(deal: Deal): GateResult {
  if (deal.expiry.date) {
    const expiryDate = new Date(deal.expiry.date);
    const now = new Date();

    if (expiryDate < now) {
      return {
        passed: false,
        reason: `Deal expired on ${deal.expiry.date}`,
      };
    }
  }

  return { passed: true };
}
