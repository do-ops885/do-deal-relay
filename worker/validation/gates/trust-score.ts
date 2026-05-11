import { Deal, Env } from "../../types";
import { GateResult } from "../types";
import { getTrustThreshold } from "../../lib/config-utils";

/**
 * Gate 4: Source Trust
 */
export function validateTrustScore(deal: Deal, env: Env): GateResult {
  const threshold = getTrustThreshold(env);
  if (deal.source.trust_score < threshold) {
    return {
      passed: false,
      reason: `Trust score ${deal.source.trust_score} below minimum ${threshold}`,
    };
  }

  return { passed: true };
}
