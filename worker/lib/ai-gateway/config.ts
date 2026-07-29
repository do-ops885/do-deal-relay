/**
 * AI Gateway Configuration
 *
 * Builds GatewayConfig from environment variables with sensible defaults.
 * Provides a fallback configuration for direct API calls when the gateway
 * is unreachable.
 *
 * @module worker/lib/ai-gateway/config
 */

import type { GatewayConfig, GatewayEnv } from "./types";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CACHE_TTL_SECONDS = 3600; // 1 hour
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const DEFAULT_MAX_RETRIES = 2;

// ============================================================================
// Configuration Factory
// ============================================================================

/**
 * Build a GatewayConfig from environment variables.
 *
 * When `AI_GATEWAY_URL` is set (always in wrangler.jsonc), the gateway
 * is enabled. The optional `fallbackUrl` and `providerApiKey` enable
 * direct-to-provider failover when the gateway is down.
 *
 * @param env - Cloudflare Worker environment bindings
 * @returns Fully resolved GatewayConfig
 */
export function buildGatewayConfig(env: GatewayEnv): GatewayConfig {
  const gatewayUrl = env.AI_GATEWAY_URL ?? "";

  return {
    gatewayUrl,
    cacheEnabled: gatewayUrl.length > 0,
    cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  };
}

/**
 * Returns a disabled config when the gateway URL is absent.
 * Useful as a safe default that short-circuits all gateway logic.
 */
export function createDisabledConfig(): GatewayConfig {
  return {
    gatewayUrl: "",
    cacheEnabled: false,
    cacheTtlSeconds: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  };
}
