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
  const required = [
    "DEALS_PROD",
    "DEALS_LOG",
    "DEALS_LOCK",
    "AI_GATEWAY_URL",
    "TRUST_THRESHOLD",
    "WEBHOOK_SECRET",
    "API_ENCRYPTION_KEY",
    "DEALS_DB",
  ];
  const missing = required.filter((k) => !env[k as keyof Env]);
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  const threshold = parseFloat(env.TRUST_THRESHOLD!);
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

// Cache for KV isolation check to avoid sequential reads on every request
let kvIsolationPromise: Promise<void> | null = null;

/**
 * Validate KV isolation by checking environment tags
 * Uses a shared promise to prevent thundering herd during cold starts
 * @param env Worker environment
 * @throws Error if environment mismatch is detected
 */
export async function validateKVIsolation(env: Env): Promise<void> {
  if (kvIsolationPromise) return kvIsolationPromise;

  const validationPromise = (async () => {
    // Only skip if explicitly in development and no ENVIRONMENT set
    if (env.ENVIRONMENT === "development" || !env.ENVIRONMENT) {
      return;
    }

    const namespaces = [
      { name: "DEALS_PROD", kv: env.DEALS_PROD },
      { name: "DEALS_STAGING", kv: env.DEALS_STAGING },
      { name: "DEALS_LOG", kv: env.DEALS_LOG },
      { name: "DEALS_LOCK", kv: env.DEALS_LOCK },
      { name: "DEALS_SOURCES", kv: env.DEALS_SOURCES },
    ];

    // Perform checks in parallel to reduce startup latency
    const checks = namespaces.map(async ({ name, kv }) => {
      if (!kv) return;

      try {
        const kvEnv = await kv.get("__KV_ENVIRONMENT__");

        // If the tag exists, it MUST match the current environment
        if (kvEnv && kvEnv !== env.ENVIRONMENT) {
          throw new Error(
            `KV Isolation Failure: ${name} is tagged for "${kvEnv}" but worker is running in "${env.ENVIRONMENT}"`,
          );
        }
      } catch (error) {
        // Don't fail the whole worker if one KV is temporarily down or inaccessible,
        // unless it's the isolation error we just threw
        if ((error as Error).message.includes("KV Isolation Failure")) {
          throw error;
        }
        console.warn(`Warning: Could not verify isolation for ${name}:`, error);
      }
    });

    await Promise.all(checks);
  })();

  kvIsolationPromise = validationPromise;
  return validationPromise;
}
