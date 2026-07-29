import type { SourceConfig } from "../types";

/**
 * Get adaptive budget defaults based on environment.
 * Production uses tighter budgets to reduce worst-case load.
 */
export function getDefaultBudgets(envName: string = "development"): {
  global: number;
  perSource: number;
  highTrustBonus: number;
} {
  switch (envName) {
    case "production":
      return { global: 500, perSource: 50, highTrustBonus: 50 };
    case "staging":
      return { global: 300, perSource: 30, highTrustBonus: 25 };
    default:
      return { global: 150, perSource: 20, highTrustBonus: 25 };
  }
}

// ============================================================================
// Discovery Budget Constants
// ============================================================================

export const DISCOVERY_CONSTANTS = {
  HIGH_TRUST_THRESHOLD: 0.7,
  VALIDATION_SUCCESS_THRESHOLD_HIGH: 0.8,
  VALIDATION_SUCCESS_THRESHOLD_MEDIUM: 0.5,
  BONUS_SUCCESS_HIGH: 0.5, // 50%
  BONUS_SUCCESS_MEDIUM: 0.25, // 25%
  PENALTY_SUCCESS_LOW: 0.75, // 25% penalty
  MATURITY_THRESHOLD_HIGH: 10,
  MATURITY_THRESHOLD_MEDIUM: 5,
  BONUS_MATURITY_HIGH: 0.2, // 20%
  BONUS_MATURITY_MEDIUM: 0.1, // 10%
  CONTEXT_WINDOW: 500,
  DESCRIPTION_CONTEXT_WINDOW: 300,
  EXPIRY_CONFIDENCE_DATE: 0.8,
  EXPIRY_CONFIDENCE_UNKNOWN: 0.3,
} as const;

/**
 * Calculate an adaptive per-source budget based on historical performance.
 *
 * Factors:
 * - Base budget (env or default)
 * - Trust bonus (high-trust sources get more)
 * - Validation success rate (sources that produce valid deals get more budget)
 * - Discovery maturity (sources with more history get a small bonus)
 */
export function calculateAdaptiveBudget(
  source: SourceConfig,
  perSourceBase: number,
  highTrustBonus: number,
): number {
  let budget = perSourceBase;

  // Trust bonus
  if (source.trust_initial > DISCOVERY_CONSTANTS.HIGH_TRUST_THRESHOLD) {
    budget += highTrustBonus;
  }

  // Validation success rate bonus
  const totalValidations =
    (source.validation_success_count || 0) +
    (source.validation_failure_count || 0);
  if (totalValidations > 0) {
    const successRate =
      (source.validation_success_count || 0) / totalValidations;
    // Add bonus for sources with high validation success
    if (successRate >= DISCOVERY_CONSTANTS.VALIDATION_SUCCESS_THRESHOLD_HIGH) {
      budget += Math.round(
        perSourceBase * DISCOVERY_CONSTANTS.BONUS_SUCCESS_HIGH,
      );
    } else if (
      successRate >= DISCOVERY_CONSTANTS.VALIDATION_SUCCESS_THRESHOLD_MEDIUM
    ) {
      budget += Math.round(
        perSourceBase * DISCOVERY_CONSTANTS.BONUS_SUCCESS_MEDIUM,
      );
    }
    // Apply penalty for sources with low success rate
    if (
      successRate < DISCOVERY_CONSTANTS.VALIDATION_SUCCESS_THRESHOLD_MEDIUM &&
      successRate > 0
    ) {
      budget = Math.round(budget * DISCOVERY_CONSTANTS.PENALTY_SUCCESS_LOW);
    }
  }

  // Discovery maturity bonus (sources with history get a small boost)
  const discoveryCount = source.discovery_count || 0;
  if (discoveryCount >= DISCOVERY_CONSTANTS.MATURITY_THRESHOLD_HIGH) {
    budget += Math.round(
      perSourceBase * DISCOVERY_CONSTANTS.BONUS_MATURITY_HIGH,
    );
  } else if (discoveryCount >= DISCOVERY_CONSTANTS.MATURITY_THRESHOLD_MEDIUM) {
    budget += Math.round(
      perSourceBase * DISCOVERY_CONSTANTS.BONUS_MATURITY_MEDIUM,
    );
  }

  return budget;
}
