/**
 * AI Gateway Client
 *
 * Proxies LLM requests through Cloudflare AI Gateway for unified
 * observability, cost tracking, and automatic failover.
 *
 * Design:
 * - `forward()` is the main entry point — sends the request through the
 *   gateway, logs structured observability data, and falls back to a
 *   direct provider call on gateway failure.
 * - `checkCache()` / `setCache()` manage an in-memory LRU cache keyed
 *   on (model, messages hash, temperature). The Worker runtime's built-in
 *   Cache API is used for persistence across requests within the same
 *   isolate.
 * - All external calls go through the Worker's native `fetch`, which is
 *   SSRF-safe at the platform level for the AI Gateway URL.
 *
 * @module worker/lib/ai-gateway/client
 */

import { logger } from "../global-logger";
import { validatedFetch } from "../security";
import { toError } from "../sanitize-error";
import type {
  GatewayConfig,
  GatewayData,
  GatewayRequest,
  GatewayResponse,
  GatewayRequestLog,
  TokenUsage,
  CostBreakdown,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

const COMPONENT = "ai-gateway";

/**
 * Estimated cost per 1K tokens by model prefix.
 * Used when the provider does not return usage pricing.
 * Values are approximate (USD) and intentionally conservative.
 */
const COST_PER_1K_TOKENS: Record<string, number> = {
  "gpt-4o": 0.005,
  "gpt-4o-mini": 0.00015,
  "gpt-4-turbo": 0.01,
  "gpt-3.5-turbo": 0.0005,
  "claude-3-opus": 0.015,
  "claude-3-sonnet": 0.003,
  "claude-3-haiku": 0.00025,
  "llama-3": 0.0008,
};

const UNKNOWN_MODEL_COST_PER_1K = 0.001;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a deterministic cache key from request parameters.
 */
function buildCacheKey(request: GatewayRequest): string {
  const messagesHash = simpleHash(JSON.stringify(request.messages));
  const temp = request.temperature ?? 1.0;
  const roundedTemp = Math.round(temp * 10) / 10;
  return `${request.model}:${messagesHash}:${roundedTemp}`;
}

/**
 * Simple deterministic string hash (djb2).
 * Good enough for cache keys — not cryptographic.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash + char) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Estimate cost based on model and token counts.
 */
function estimateCost(model: string, usage: TokenUsage): CostBreakdown {
  const modelKey = Object.keys(COST_PER_1K_TOKENS).find((prefix) =>
    model.startsWith(prefix),
  );
  const costPer1k =
    (modelKey ? COST_PER_1K_TOKENS[modelKey] : undefined) ??
    UNKNOWN_MODEL_COST_PER_1K;

  const promptCostUsd = (usage.promptTokens / 1000) * costPer1k;
  const completionCostUsd = (usage.completionTokens / 1000) * costPer1k;

  return {
    promptCostUsd: Math.round(promptCostUsd * 1_000_000) / 1_000_000,
    completionCostUsd: Math.round(completionCostUsd * 1_000_000) / 1_000_000,
    totalCostUsd:
      Math.round((promptCostUsd + completionCostUsd) * 1_000_000) / 1_000_000,
  };
}

/**
 * Extract token usage from an OpenAI-compatible response body.
 */
function extractUsage(data: unknown): TokenUsage {
  if (typeof data !== "object" || data === null) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const obj = data as Record<string, unknown>;
  const usage = obj.usage;

  if (typeof usage !== "object" || usage === null) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const u = usage as Record<string, unknown>;
  const promptTokens =
    typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const completionTokens =
    typeof u.completion_tokens === "number" ? u.completion_tokens : 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

// ============================================================================
// AIGatewayClient
// ============================================================================

export class AIGatewayClient {
  private readonly config: GatewayConfig;
  private readonly cache: Map<string, { data: unknown; expiresAt: number }>;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.cache = new Map();
  }

  /**
   * Forward an LLM request through the AI Gateway.
   *
   * Flow:
   * 1. Check in-memory cache (if enabled)
   * 2. POST to gateway URL
   * 3. On failure, retry up to `maxRetries` times
   * 4. On persistent failure, fall back to direct provider if configured
   * 5. Log structured observability data
   * 6. Cache successful responses (if enabled)
   *
   * @param request - The LLM request to forward
   * @param authToken - Bearer token for the upstream provider
   * @returns Structured GatewayResponse with usage and cost data
   */
  async forward(
    request: GatewayRequest,
    authToken: string,
  ): Promise<GatewayResponse> {
    const startTime = Date.now();

    // 1. Check cache
    if (this.config.cacheEnabled) {
      const cached = this.checkCache(request);
      if (cached) {
        const latencyMs = Date.now() - startTime;
        this.logRequest({
          timestamp: new Date().toISOString(),
          model: request.model,
          promptTokens: cached.usage.promptTokens,
          completionTokens: cached.usage.completionTokens,
          costUsd: cached.cost.totalCostUsd,
          latencyMs,
          cached: true,
          failover: false,
          statusCode: 200,
        });
        return { ...cached, cached: true, latencyMs };
      }
    }

    // 2. Attempt gateway call with retries
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(
          this.config.gatewayUrl,
          request,
          authToken,
        );
        const latencyMs = Date.now() - startTime;

        const usage = extractUsage(response.data);
        const cost = estimateCost(request.model, usage);

        const result: GatewayResponse = {
          ok: response.ok,
          data: response.data as GatewayData | null,
          usage,
          cost,
          statusCode: response.statusCode,
          cached: false,
          failover: false,
          latencyMs,
        };

        // Retry on server errors (5xx) — throw to trigger the retry loop
        if (!response.ok && response.statusCode >= 500) {
          lastError = new Error(`Gateway returned ${response.statusCode}`);
          logger.warn(
            `AI Gateway server error (attempt ${attempt + 1}/${this.config.maxRetries + 1}): ${response.statusCode}`,
            {
              component: COMPONENT,
              model: request.model,
              attempt: attempt + 1,
              statusCode: response.statusCode,
            },
          );
          continue;
        }

        // Cache successful responses
        if (response.ok && this.config.cacheEnabled) {
          this.setCache(request, result);
        }

        this.logRequest({
          timestamp: new Date().toISOString(),
          model: request.model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          costUsd: cost.totalCostUsd,
          latencyMs,
          cached: false,
          failover: false,
          statusCode: response.statusCode,
        });

        return result;
      } catch (error) {
        lastError = toError(error);
        logger.warn(
          `AI Gateway request failed (attempt ${attempt + 1}/${this.config.maxRetries + 1}): ${lastError.message}`,
          {
            component: COMPONENT,
            model: request.model,
            attempt: attempt + 1,
          },
        );
      }
    }

    // 3. Failover to direct provider (if configured)
    if (this.config.fallbackUrl && this.config.providerApiKey) {
      return this.failover(request, authToken, startTime, lastError);
    }

    // All attempts failed and no fallback configured
    return this.buildErrorResponse(
      request,
      startTime,
      lastError?.message ?? "Unknown error",
      false,
    );
  }

  /**
   * Check the in-memory cache for a matching request.
   */
  checkCache(request: GatewayRequest): GatewayResponse | null {
    const key = buildCacheKey(request);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as GatewayResponse;
  }

  /**
   * Store a response in the in-memory cache.
   */
  setCache(request: GatewayRequest, response: GatewayResponse): void {
    const key = buildCacheKey(request);
    this.cache.set(key, {
      data: response,
      expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
    });
  }

  /**
   * Clear all cached entries.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Attempt a direct call to the provider, bypassing the gateway.
   */
  private async failover(
    request: GatewayRequest,
    authToken: string,
    startTime: number,
    lastError: Error | undefined,
  ): Promise<GatewayResponse> {
    const fallbackUrl = this.config.fallbackUrl;
    if (!fallbackUrl) {
      return this.buildErrorResponse(
        request,
        startTime,
        "No fallback URL configured",
        true,
      );
    }

    logger.warn("AI Gateway failover triggered, calling provider directly", {
      component: COMPONENT,
      model: request.model,
      gatewayError: lastError?.message,
    });

    try {
      const response = await this.executeRequest(
        fallbackUrl,
        request,
        authToken,
      );
      const latencyMs = Date.now() - startTime;

      const usage = extractUsage(response.data);
      const cost = estimateCost(request.model, usage);

      const result: GatewayResponse = {
        ok: response.ok,
        data: response.data as GatewayData | null,
        usage,
        cost,
        statusCode: response.statusCode,
        cached: false,
        failover: true,
        latencyMs,
      };

      this.logRequest({
        timestamp: new Date().toISOString(),
        model: request.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costUsd: cost.totalCostUsd,
        latencyMs,
        cached: false,
        failover: true,
        statusCode: response.statusCode,
      });

      return result;
    } catch (error) {
      const err = toError(error);
      return this.buildErrorResponse(request, startTime, err.message, true);
    }
  }

  /**
   * Build a standardized error response with observability logging.
   */
  private buildErrorResponse(
    request: GatewayRequest,
    startTime: number,
    errorMessage: string,
    failover: boolean,
  ): GatewayResponse {
    const latencyMs = Date.now() - startTime;

    this.logRequest({
      timestamp: new Date().toISOString(),
      model: request.model,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs,
      cached: false,
      failover,
      statusCode: 502,
      error: errorMessage,
    });

    return {
      ok: false,
      data: null,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      cost: { promptCostUsd: 0, completionCostUsd: 0, totalCostUsd: 0 },
      statusCode: 502,
      cached: false,
      failover,
      latencyMs,
    };
  }

  /**
   * Execute a single HTTP request to the gateway/provider.
   */
  private async executeRequest(
    url: string,
    request: GatewayRequest,
    authToken: string,
  ): Promise<{ ok: boolean; data: unknown; statusCode: number }> {
    const { signal, cleanup } = createTimeoutSignal(this.config.timeoutMs);

    try {
      const response = await validatedFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(request),
        signal,
      });

      const statusCode = response.status;
      let data: unknown = null;

      try {
        data = await response.json();
      } catch {
        // Response may not be JSON (e.g., 502 HTML from gateway)
        data = null;
      }

      return { ok: response.ok, data, statusCode };
    } finally {
      cleanup();
    }
  }

  /**
   * Emit a structured log entry for observability.
   */
  private logRequest(log: GatewayRequestLog): void {
    logger.info("AI Gateway request", {
      component: COMPONENT,
      ...log,
    });
  }
}

// ============================================================================
// Timeout Helper (self-contained, mirrors worker/lib/utils.ts pattern)
// ============================================================================

function createTimeoutSignal(ms: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}
