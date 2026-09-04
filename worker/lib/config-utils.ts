import { CONFIG } from "../config";
import type { Env } from "../types";

/**
 * Safely parse an integer environment variable bounded by minimum and maximum constraints
 * @param name The environment variable name
 * @param value The raw string environment variable value
 * @param fallback The fallback number if value is undefined or blank
 * @param minimum The minimum allowable integer value
 * @param maximum The maximum allowable integer value
 * @returns The parsed integer within bounds
 * @throws Error if value is non-integer or out of bounds
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
 * Validate the required environment configuration and budget parameters
 * @param env Worker environment
 * @throws Error if any required environment variable is missing or invalid
 */
export function validateConfig(env: Env): void {
  const required = [
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
  ];
  const missing = required.filter((key) => {
    const value = env[key as keyof Env];
    return typeof value === "string" ? value.trim() === "" : !value;
  });
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  const threshold = parseFloat(env.TRUST_THRESHOLD);
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`TRUST_THRESHOLD must be a number between 0 and 1`);
  }

  // Validate budget configurations
  const budgetVars = [
    "CANDIDATE_BUDGET_GLOBAL",
    "CANDIDATE_BUDGET_PER_SOURCE",
    "CANDIDATE_BUDGET_HIGH_TRUST_BONUS",
  ] as const;

  for (const varName of budgetVars) {
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
