/**
 * AI Gateway - Barrel Export
 *
 * Re-exports the client, configuration, and types for convenient
 * one-import access from route handlers.
 *
 * @module worker/lib/ai-gateway
 */

export { AIGatewayClient } from "./client";
export { buildGatewayConfig, createDisabledConfig } from "./config";
export type {
  GatewayConfig,
  GatewayEnv,
  GatewayRequest,
  GatewayResponse,
  GatewayRequestLog,
  TokenUsage,
  CostBreakdown,
  CacheKey,
} from "./types";
