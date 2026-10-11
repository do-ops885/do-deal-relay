import { CONFIG } from "../config";
import type { Env } from "../types";

/** Minimum allowable lower bound for the trust threshold */
export const MIN_TRUST_THRESHOLD_BOUND = 0;

/** Maximum allowable upper bound for the trust threshold */
export const MAX_TRUST_THRESHOLD_BOUND = 1;

/** List of required environment variable binding keys for worker runtime initialization */
export const REQUIRED_CONFIG_KEYS = [
  "DEALS_PROD",
  "DEALS_LOG",
  "DEALS_LOCK",
  "AI_GATEWAY_URL",
  "TRUST_THRESHOLD",
  "WEBHOOK_SECRET",
  "EMAIL_WEBHOOK_SECRET",
  "API_ENCRYPTION_KEY",
  "JWT_SECRET",
  "DEALS_DB",
  "ENVIRONMENT",
  "GITHUB_REPO",
] as const;

/** List of optional budget configuration variable keys for candidate evaluation */
export const BUDGET_CONFIG_KEYS = [
  "CANDIDATE_BUDGET_GLOBAL",
  "CANDIDATE_BUDGET_PER_SOURCE",
  "CANDIDATE_BUDGET_HIGH_TRUST_BONUS",
] as const;

/**
 * Safely parse an integer environment variable bounded by minimum and maximum constraints
 * @param name The environment variable name
 * @param value The raw string environment variable value
 * @param fallback The fallback number if value is undefined or blank
 * @param minimum The minimum allowable integer value
 * @param maximum The maximum allowable integer value
 * @returns The parsed integer within specified bounds
 * @throws Error if value contains non-decimal characters, floating point numbers, or is out of bounds
 */
export function parseBoundedIntegerConfig(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

/**
 * Get the trust threshold from environment or fallback to default, clamped to [0, 1] bounds
 * @param env Worker environment bindings
 * @returns Trust threshold float parsed from environment clamped between MIN_TRUST_THRESHOLD_BOUND and MAX_TRUST_THRESHOLD_BOUND
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
  return Math.max(
    MIN_TRUST_THRESHOLD_BOUND,
    Math.min(MAX_TRUST_THRESHOLD_BOUND, parsed),
  );
}

/**
 * Validate required environment bindings and configuration values
 * @param env Worker environment bindings
 * @returns {void}
 * @throws Error if required variables are missing or if threshold/budget configs are invalid or negative
 */
export function validateConfig(env: Env): void {
  const missing = REQUIRED_CONFIG_KEYS.filter((key) => {
    const value = env[key as keyof Env];
    return typeof value === "string" ? value.trim() === "" : !value;
  });
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  const threshold = parseFloat(env.TRUST_THRESHOLD);
  if (
    isNaN(threshold) ||
    threshold < MIN_TRUST_THRESHOLD_BOUND ||
    threshold > MAX_TRUST_THRESHOLD_BOUND
  ) {
    throw new Error(`TRUST_THRESHOLD must be a number between 0 and 1`);
  }

  for (const varName of BUDGET_CONFIG_KEYS) {
    const value = env[varName];
    if (value) {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid ${varName}: "${value}" is not a number`);
      }
      if (parsed < 0) {
        throw new Error(`Invalid ${varName}: ${parsed} must be non-negative`);
      }
    }
  }
}
