import { Deal } from "../../types";
import { GateResult } from "../types";
import { CONFIG } from "../../config";

/**
 * Gate 5: Reward Plausibility (Price Sanity)
 */
export function validatePriceSanity(deal: Deal): GateResult {
  const reward = deal.reward;

  // Check for negative values
  if (typeof reward.value === "number" && reward.value < 0) {
    return { passed: false, reason: "Negative reward value" };
  }

  // Check for suspiciously high cash values
  if (reward.type === "cash" && typeof reward.value === "number") {
    if (reward.value > CONFIG.MAX_REWARD_VALUE) {
      return {
        passed: false,
        reason: `Reward value ${reward.value} exceeds maximum ${CONFIG.MAX_REWARD_VALUE}`,
      };
    }
  }

  // Check percent is reasonable
  if (reward.type === "percent" && typeof reward.value === "number") {
    if (reward.value > CONFIG.PLAUSIBILITY_THRESHOLDS.CASH_MEDIUM) {
      return {
        passed: false,
        reason: `Percent reward ${reward.value}% exceeds 100%`,
      };
    }
  }

  return { passed: true };
}
