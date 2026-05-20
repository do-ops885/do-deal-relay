/**
 * NLQ Handlers Tests - POST Endpoint
 *
 * Tests for handleNLQ (POST /api/nlq) in handlers.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";
import { handleNLQ } from "../../../worker/routes/nlq/handlers";
import type { Env } from "../../../worker/types";

// Mock rate-limit module
vi.mock("../../../worker/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 29,
    resetTime: Math.floor(Date.now() / 1000) + 60,
    limit: 30,
  })),
  getClientIdentifier: vi.fn(() => "ip:127.0.0.1"),
  createRateLimitHeaders: vi.fn(() => {
    const h = new Headers();
    h.set("X-RateLimit-Limit", "30");
    h.set("X-RateLimit-Remaining", "29");
    h.set("X-RateLimit-Reset", String(Math.floor(Date.now() / 1000) + 60));
    return h;
  }),
}));

import * as rateLimit from "../../../worker/lib/rate-limit";

// Mock the parser
vi.mock("../../../worker/lib/nlq/parser", () => ({
  parseQuery: vi.fn((query: string) => ({
    originalText: query,
    cleanedText: query.toLowerCase().trim(),
    tokens: query.split(/\s+/).map((t, i) => ({
      value: t,
      type: /^\d+$/.test(t) ? "number" : "word",
      position: i,
      normalized: t.toLowerCase(),
    })),
    intent: {
      intent: "search",
      confidence: 0.85,
      keywords: ["find", "search"],
      originalQuery: query,
    },
    entities: query.includes("$")
      ? [{ type: "reward_value", value: 100, operator: "gte", confidence: 0.9 }]
      : [],
  })),
}));

// Mock the query-builder
vi.mock("../../../worker/lib/nlq/query-builder", () => ({
  buildStructuredQuery: vi.fn(() => ({
    textQuery: "trading",
    filters: [],
    categories: ["trading"],
    domains: undefined,
    rewardTypes: undefined,
    minRewardValue: undefined,
    maxRewardValue: undefined,
    status: "active",
    includeExpired: false,
    sortBy: "relevance",
    sortOrder: "desc",
    limit: 20,
    offset: 0,
  })),
  executeStructuredQuery: vi.fn(async () => [
    {
      id: 1,
      deal_id: "deal-1",
      title: "Trading Bonus",
      description: "Get $100 bonus",
      domain: "example.com",
      code: "TRADE100",
      url: "https://example.com/ref",
      reward_type: "cash",
      reward_value: 100,
      reward_currency: "USD",
      status: "active",
      category: ["trading"],
      tags: ["bonus"],
      confidence_score: 0.9,
      relevance: 0.85,
    },
  ]),
  explainQuery: vi.fn(() => ({
    intent: "search",
    intent_confidence: 0.85,
    entities_found: 1,
    filters_applied: ["Status: active", "Active deals only"],
    search_text: "trading",
    sort_applied: { field: "relevance", order: "desc" },
  })),
}));

import {
  buildStructuredQuery,
  executeStructuredQuery,
} from "../../../worker/lib/nlq/query-builder";

describe("NLQ Handlers - POST", () => {
  let mockEnv: Env;
  let mockKvStorage: Map<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {
        get: vi.fn(async <T>(key: string) => mockKvStorage.get(key) as T),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(key);
        }),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      DEALS_DB: {} as D1Database,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  describe("handleNLQ", () => {
    it("should return 503 when D1 database is not configured", async () => {
      const envWithoutDb = { ...mockEnv, DEALS_DB: undefined } as Env;
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals" }),
      });

      const response = await handleNLQ(request, envWithoutDb);

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe("DATABASE_UNAVAILABLE");
    });

    it("should return 429 when rate limit is exceeded", async () => {
      vi.mocked(rateLimit.checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        resetTime: Math.floor(Date.now() / 1000) + 30,
        limit: 30,
      });

      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals" }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.code).toBe("RATE_LIMITED");
      expect(body.retry_after).toBeDefined();
    });

    it("should return 400 for invalid JSON body", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("PARSE_ERROR");
      expect(body.error).toBe("Invalid JSON");
    });

    it("should return 400 for empty body", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for missing query field", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for empty query string", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "" }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 200 with results for valid query", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find trading deals" }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.query).toBe("find trading deals");
      expect(body.count).toBe(1);
      expect(body.results).toHaveLength(1);
      expect(body.explanation).toBeDefined();
      expect(body.execution_time_ms).toBeDefined();
    });

    it("should include rate limit headers in successful response", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals" }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("29");
    });

    it("should respect custom limit parameter", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals", limit: 5 }),
      });

      await handleNLQ(request, mockEnv);

      const callArgs = vi.mocked(buildStructuredQuery).mock.calls[0];
      expect(callArgs[2]?.limit).toBe(5);
    });

    it("should respect include_expired parameter", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals", include_expired: true }),
      });

      await handleNLQ(request, mockEnv);

      const callArgs = vi.mocked(buildStructuredQuery).mock.calls[0];
      expect(callArgs[2]?.includeExpired).toBe(true);
    });

    it("should respect offset parameter", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals", offset: 10 }),
      });

      await handleNLQ(request, mockEnv);

      const callArgs = vi.mocked(buildStructuredQuery).mock.calls[0];
      expect(callArgs[2]?.offset).toBe(10);
    });

    it("should handle query execution errors gracefully", async () => {
      vi.mocked(executeStructuredQuery).mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals" }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.code).toBe("EXECUTION_ERROR");
      expect(body.error).toBe("Query execution failed");
      expect(body.details.query).toBe("find deals");
    });

    it("should handle non-Error throwables", async () => {
      vi.mocked(executeStructuredQuery).mockRejectedValueOnce("string error");

      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals" }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("string error");
    });

    it("should return empty results array when no deals match", async () => {
      vi.mocked(executeStructuredQuery).mockResolvedValueOnce([]);

      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find nonexistent deals" }),
      });

      const response = await handleNLQ(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(0);
      expect(body.results).toEqual([]);
    });

    it("should use client identifier from request headers", async () => {
      const request = new Request("http://localhost/api/nlq", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "my-secret-key-12345",
        },
        body: JSON.stringify({ query: "find deals" }),
      });

      await handleNLQ(request, mockEnv);

      expect(rateLimit.getClientIdentifier).toHaveBeenCalledWith(request);
    });
  });
});
