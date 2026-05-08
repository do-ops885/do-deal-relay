import { CONFIG } from "../config";
import type { Env } from "../types";

/**
 * Get the trust threshold from environment or fallback to default
 * @param env Worker environment
 * @returns Trust threshold as a number
 */
export function getTrustThreshold(env: Env): number {
  if (!env.TRUST_THRESHOLD) {
    return CONFIG.MIN_TRUST_SCORE;
  }

  const parsed = parseFloat(env.TRUST_THRESHOLD);

  if (isNaN(parsed)) {
    return CONFIG.MIN_TRUST_SCORE;
  }

  // Ensure it's within [0, 1] range
  return Math.max(0, Math.min(1, parsed));
}

/**
 * Validate the trust threshold configuration
 * @param env Worker environment
 * @throws Error if the threshold is invalid (non-numeric or out of range)
 */
export function validateConfig(env: Env): void {
  if (env.TRUST_THRESHOLD) {
    const parsed = parseFloat(env.TRUST_THRESHOLD);

    if (isNaN(parsed)) {
      throw new Error(
        `Invalid TRUST_THRESHOLD: "${env.TRUST_THRESHOLD}" is not a number`,
      );
    }

    if (parsed < 0 || parsed > 1) {
      throw new Error(
        `Invalid TRUST_THRESHOLD: ${parsed} must be between 0 and 1`,
      );
    }
  }
}
