/**
 * Native Rate Limiting Binding Selector (ADR-028)
 *
 * Maps endpoint rate-limit configs to the Workers Rate Limiting bindings
 * declared in wrangler.jsonc (`ratelimits`). The binding is the primary
 * enforcement path for standard 60-second windows; lib/rate-limit.ts falls
 * back to KV when no binding matches (300s windows, per-key overrides,
 * or deploy surfaces without the bindings).
 *
 * @module worker/lib/rate-limit-binding
 */

import type { Env } from "../types";
import type { RateLimitConfig } from "./rate-limit";

/** Window length supported by the native binding used here. */
const BINDING_PERIOD_SECONDS = 60;

/**
 * Resolve the native binding matching a rate-limit config, or undefined
 * when the config cannot be served by a binding (non-60s window or no
 * binding provisioned for that limit value on this deploy surface).
 */
export function getRateLimitBinding(
  env: Env,
  config: RateLimitConfig,
): RateLimit | undefined {
  if (config.windowSeconds !== BINDING_PERIOD_SECONDS) {
    return undefined;
  }
  switch (config.maxRequests) {
    case 5:
      return env.RL_5_60;
    case 10:
      return env.RL_10_60;
    case 20:
      return env.RL_20_60;
    case 30:
      return env.RL_30_60;
    case 50:
      return env.RL_50_60;
    case 60:
      return env.RL_60_60;
    case 100:
      return env.RL_100_60;
    default:
      return undefined;
  }
}

/**
 * Check a request against the native binding.
 *
 * Returns the outcome, or undefined when no binding applies so the caller
 * can fall through to the KV path. Errors are NOT caught here — the caller
 * owns the fail-open/fail-closed policy per endpoint sensitivity.
 */
export async function checkRateLimitViaBinding(
  env: Env,
  identifier: string,
  config: RateLimitConfig,
): Promise<{ success: boolean } | undefined> {
  const binding = getRateLimitBinding(env, config);
  if (!binding) {
    return undefined;
  }
  const key = `${config.keyPrefix}:${identifier}`;
  return binding.limit({ key });
}
