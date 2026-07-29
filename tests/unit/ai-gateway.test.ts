/**
 * AI Gateway Client Tests
 *
 * Mocks fetch for all gateway responses. Tests forwarding, caching,
 * failover, error handling, and observability logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AIGatewayClient,
  buildGatewayConfig,
  createDisabledConfig,
} from "../../worker/lib/ai-gateway";
import type { GatewayRequest } from "../../worker/lib/ai-gateway/types";

// ============================================================================
// Fixtures
// ============================================================================

const VALID_REQUEST: GatewayRequest = {
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is 2+2?" },
  ],
  temperature: 0.7,
  max_tokens: 100,
};

const GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/acct/gw/openai";
const AUTH_TOKEN = "test-api-key";

function okResponse(): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-123",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "4" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 25, completion_tokens: 5, total_tokens: 30 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function successConfig(
  overrides?: Partial<ConstructorParameters<typeof AIGatewayClient>[0]>,
) {
  return {
    gatewayUrl: GATEWAY_URL,
    cacheEnabled: false,
    cacheTtlSeconds: 60,
    timeoutMs: 5000,
    maxRetries: 1,
    ...overrides,
  };
}

// ============================================================================
// Config Tests
// ============================================================================

describe("buildGatewayConfig", () => {
  it("returns config with gateway URL from env", () => {
    const config = buildGatewayConfig({ AI_GATEWAY_URL: GATEWAY_URL });
    expect(config.gatewayUrl).toBe(GATEWAY_URL);
    expect(config.cacheEnabled).toBe(true);
    expect(config.cacheTtlSeconds).toBe(3600);
    expect(config.timeoutMs).toBe(30_000);
    expect(config.maxRetries).toBe(2);
  });

  it("disables cache when gateway URL is empty", () => {
    const config = buildGatewayConfig({});
    expect(config.cacheEnabled).toBe(false);
  });
});

describe("createDisabledConfig", () => {
  it("returns a config with gateway disabled", () => {
    const config = createDisabledConfig();
    expect(config.gatewayUrl).toBe("");
    expect(config.cacheEnabled).toBe(false);
    expect(config.maxRetries).toBe(0);
  });
});

// ============================================================================
// Client - Forward Tests
// ============================================================================

describe("AIGatewayClient", () => {
  let client: AIGatewayClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AIGatewayClient(successConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("forward()", () => {
    it("sends request to gateway URL with correct headers", async () => {
      fetchSpy.mockResolvedValueOnce(okResponse());
      await client.forward(VALID_REQUEST, AUTH_TOKEN);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(GATEWAY_URL);
      expect(init.method).toBe("POST");

      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`Bearer ${AUTH_TOKEN}`);
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body["model"]).toBe("gpt-4o");
      expect(body["messages"]).toHaveLength(2);
    });

    it("returns ok response with usage and cost data", async () => {
      fetchSpy.mockResolvedValueOnce(okResponse());
      const result = await client.forward(VALID_REQUEST, AUTH_TOKEN);

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.usage.promptTokens).toBe(25);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(30);
      expect(result.cost.totalCostUsd).toBeGreaterThan(0);
      expect(result.failover).toBe(false);
      expect(result.cached).toBe(false);
    });

    it("retries on 5xx then succeeds", async () => {
      fetchSpy
        .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
        .mockResolvedValueOnce(okResponse());

      const result = await client.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("returns error when all attempts fail and no fallback", async () => {
      fetchSpy.mockRejectedValue(new Error("Network error"));
      const result = await client.forward(VALID_REQUEST, AUTH_TOKEN);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(502);
      expect(result.usage.totalTokens).toBe(0);
      expect(result.failover).toBe(false);
    });

    it("handles non-JSON response body gracefully", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("<html>Bad Gateway</html>", { status: 502 }),
      );
      const result = await client.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
    });

    it("handles response with no usage field", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "cmpl-1", choices: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const result = await client.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(result.ok).toBe(true);
      expect(result.usage.totalTokens).toBe(0);
    });

    it("reports latency in milliseconds", async () => {
      fetchSpy.mockResolvedValueOnce(okResponse());
      const result = await client.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.latencyMs).toBe("number");
    });
  });

  // ============================================================================
  // Failover Tests
  // ============================================================================

  describe("failover", () => {
    it("falls back to direct provider when gateway fails", async () => {
      const failoverClient = new AIGatewayClient(
        successConfig({
          fallbackUrl: "https://api.openai.com/v1/chat/completions",
          providerApiKey: "sk-direct-key",
          maxRetries: 0,
        }),
      );

      fetchSpy
        .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
        .mockResolvedValueOnce(okResponse());

      const result = await failoverClient.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(result.ok).toBe(true);
      expect(result.failover).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const secondCall = fetchSpy.mock.calls[1];
      expect(secondCall).toBeDefined();
      const [, fallbackInit] = secondCall as [string, RequestInit];
      const fallbackHeaders = fallbackInit.headers as Record<string, string>;
      expect(fallbackHeaders["Authorization"]).toBe(`Bearer ${AUTH_TOKEN}`);
    });

    it("returns error when both gateway and fallback fail", async () => {
      const failoverClient = new AIGatewayClient(
        successConfig({
          fallbackUrl: "https://api.openai.com/v1/chat/completions",
          providerApiKey: "sk-direct-key",
          maxRetries: 0,
        }),
      );

      fetchSpy.mockRejectedValue(new Error("Connection refused"));
      const result = await failoverClient.forward(VALID_REQUEST, AUTH_TOKEN);

      expect(result.ok).toBe(false);
      expect(result.failover).toBe(true);
      expect(result.statusCode).toBe(502);
    });
  });

  // ============================================================================
  // Cache Tests
  // ============================================================================

  describe("cache", () => {
    let cachedClient: AIGatewayClient;

    beforeEach(() => {
      cachedClient = new AIGatewayClient(
        successConfig({
          cacheEnabled: true,
          cacheTtlSeconds: 60,
          maxRetries: 0,
        }),
      );
    });

    it("caches successful responses and returns cache hit", async () => {
      fetchSpy.mockResolvedValueOnce(okResponse());
      const first = await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(first.ok).toBe(true);
      expect(first.cached).toBe(false);

      const second = await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(second.ok).toBe(true);
      expect(second.cached).toBe(true);
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it("does not cache failed responses", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));
      await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);

      fetchSpy.mockResolvedValueOnce(okResponse());
      await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("differentiates cache by model", async () => {
      fetchSpy.mockResolvedValue(okResponse());
      await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);

      await cachedClient.forward(
        { ...VALID_REQUEST, model: "claude-3-opus" },
        AUTH_TOKEN,
      );
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("differentiates cache by messages", async () => {
      fetchSpy.mockResolvedValue(okResponse());
      await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);

      await cachedClient.forward(
        {
          ...VALID_REQUEST,
          messages: [{ role: "user", content: "What is 3+3?" }],
        },
        AUTH_TOKEN,
      );
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("clearCache() removes all cached entries", async () => {
      fetchSpy.mockResolvedValue(okResponse());
      await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);
      cachedClient.clearCache();

      await cachedClient.forward(VALID_REQUEST, AUTH_TOKEN);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("expires cache entries after TTL", async () => {
      const shortTtlClient = new AIGatewayClient(
        successConfig({
          cacheEnabled: true,
          cacheTtlSeconds: 0,
          maxRetries: 0,
        }),
      );
      fetchSpy.mockResolvedValue(okResponse());

      await shortTtlClient.forward(VALID_REQUEST, AUTH_TOKEN);
      const cached = shortTtlClient.checkCache(VALID_REQUEST);
      expect(cached).toBeNull();
    });

    it("checkCache() returns null when disabled", async () => {
      const disabledClient = new AIGatewayClient(
        successConfig({ cacheEnabled: false }),
      );
      const cached = disabledClient.checkCache(VALID_REQUEST);
      expect(cached).toBeNull();
    });
  });

  // ============================================================================
  // Cost Estimation Tests
  // ============================================================================

  describe("cost estimation", () => {
    it("estimates cost for known models", async () => {
      fetchSpy.mockResolvedValueOnce(okResponse());
      const result = await client.forward(VALID_REQUEST, AUTH_TOKEN);

      expect(result.cost.promptCostUsd).toBeGreaterThan(0);
      expect(result.cost.completionCostUsd).toBeGreaterThan(0);
      expect(result.cost.totalCostUsd).toBeCloseTo(
        result.cost.promptCostUsd + result.cost.completionCostUsd,
        6,
      );
    });

    it("uses default cost for unknown models", async () => {
      fetchSpy.mockResolvedValueOnce(okResponse());
      const result = await client.forward(
        { ...VALID_REQUEST, model: "unknown-model-xyz" },
        AUTH_TOKEN,
      );
      expect(result.cost.totalCostUsd).toBeGreaterThan(0);
    });
  });
});
