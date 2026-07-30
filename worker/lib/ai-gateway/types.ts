/**
 * AI Gateway Client Types
 *
 * Complete type definitions for the AI Gateway client module.
 *
 * @module worker/lib/ai-gateway/types
 */

// ============================================================================
// Environment Types
// ============================================================================

/** Minimal env shape required by the gateway client. */
export interface GatewayEnv {
  AI_GATEWAY_URL?: string;
}

// ============================================================================
// Request / Response Types
// ============================================================================

/** A chat message in the request. */
export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Input to AIGatewayClient.forward(). */
export interface GatewayRequest {
  model: string;
  messages: GatewayMessage[];
  temperature?: number;
  max_tokens?: number;
}

/** Token usage breakdown. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Estimated cost breakdown in USD. */
export interface CostBreakdown {
  promptCostUsd: number;
  completionCostUsd: number;
  totalCostUsd: number;
}

/** Raw API response data (parsed JSON or null on failure). */
export interface GatewayData {
  id?: string;
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
}

/** Result returned by forward(). */
export interface GatewayResponse {
  ok: boolean;
  data: GatewayData | null;
  usage: TokenUsage;
  cost: CostBreakdown;
  statusCode: number;
  cached: boolean;
  failover: boolean;
  latencyMs: number;
}

/** Structured log entry for observability. */
export interface GatewayRequestLog {
  timestamp: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  cached: boolean;
  failover: boolean;
  statusCode: number;
  error?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/** Configuration for the AI Gateway client. */
export interface GatewayConfig {
  gatewayUrl: string;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  timeoutMs: number;
  maxRetries: number;
  fallbackUrl?: string;
  providerApiKey?: string;
}

// ============================================================================
// Cache Types
// ============================================================================

/** Deterministic cache key built from request parameters. */
export type CacheKey = string;
