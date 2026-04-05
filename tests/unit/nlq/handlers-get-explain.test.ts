/**
 * NLQ Handlers Tests - GET & Explain Endpoints
 *
 * Tests for handleNLQGet and handleNLQExplain in handlers.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";
import {
  handleNLQGet,
  handleNLQExplain,
} from "../../../worker/routes/nlq/handlers";
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

import { parseQuery } from "../../../worker/lib/nlq/parser";
import {
  buildStructuredQuery,
  executeStructuredQuery,
} from "../../../worker/lib/nlq/query-builder";

describe("NLQ Handlers - GET & Explain", () => {
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

  // ============================================================================
  // handleNLQGet (GET)
  // ============================================================================

  describe("handleNLQGet", () => {
    it("should return 503 when D1 database is not configured", async () => {
      const envWithoutDb = { ...mockEnv, DEALS_DB: undefined } as Env;
      const url = new URL("http://localhost/api/nlq?q=deals");

      const response = await handleNLQGet(url, envWithoutDb);

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe("DATABASE_UNAVAILABLE");
    });

    it("should return 400 when query parameter is missing", async () => {
      const url = new URL("http://localhost/api/nlq");

      const response = await handleNLQGet(url, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("MISSING_PARAMETER");
    });

    it("should return 400 when query is too long", async () => {
      const longQuery = "a".repeat(501);
      const url = new URL(`http://localhost/api/nlq?q=${longQuery}`);

      const response = await handleNLQGet(url, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("QUERY_TOO_LONG");
    });

    it("should return 200 with results for valid GET query", async () => {
      const url = new URL(
        "http://localhost/api/nlq?q=trading%20platforms%20with%20bonus",
      );

      const response = await handleNLQGet(url, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.query).toBe("trading platforms with bonus");
      expect(body.count).toBe(1);
    });

    it("should respect limit parameter in GET request", async () => {
      vi.clearAllMocks();
      const url = new URL("http://localhost/api/nlq?q=deals&limit=5");

      await handleNLQGet(url, mockEnv);

      const callArgs = vi.mocked(buildStructuredQuery).mock.calls[0];
      expect(callArgs[2]?.limit).toBe(5);
    });

    it("should use default limit when not specified", async () => {
      vi.clearAllMocks();
      const url = new URL("http://localhost/api/nlq?q=deals");

      await handleNLQGet(url, mockEnv);

      const callArgs = vi.mocked(buildStructuredQuery).mock.calls[0];
      expect(callArgs[2]?.limit).toBe(20);
    });

    it("should respect include_expired parameter in GET request", async () => {
      vi.clearAllMocks();
      const url = new URL(
        "http://localhost/api/nlq?q=deals&include_expired=true",
      );

      await handleNLQGet(url, mockEnv);

      const callArgs = vi.mocked(buildStructuredQuery).mock.calls[0];
      expect(callArgs[2]?.includeExpired).toBe(true);
    });

    it("should handle GET query execution errors", async () => {
      vi.mocked(executeStructuredQuery).mockRejectedValueOnce(
        new Error("DB timeout"),
      );

      const url = new URL("http://localhost/api/nlq?q=deals");

      const response = await handleNLQGet(url, mockEnv);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.code).toBe("EXECUTION_ERROR");
    });

    it("should handle empty query string parameter", async () => {
      const url = new URL("http://localhost/api/nlq?q=");

      const response = await handleNLQGet(url, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("MISSING_PARAMETER");
    });

    it("should handle query at exactly 500 characters", async () => {
      const query500 = "a".repeat(500);
      const url = new URL(`http://localhost/api/nlq?q=${query500}`);

      const response = await handleNLQGet(url, mockEnv);

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // handleNLQExplain
  // ============================================================================

  describe("handleNLQExplain", () => {
    it("should return 503 when D1 database is not configured", async () => {
      const envWithoutDb = { ...mockEnv, DEALS_DB: undefined } as Env;
      const request = new Request("http://localhost/api/nlq/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "deals" }),
      });

      const response = await handleNLQExplain(request, envWithoutDb);

      expect(response.status).toBe(503);
    });

    it("should handle POST request with valid query", async () => {
      const request = new Request("http://localhost/api/nlq/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find trading deals with $100 bonus" }),
      });

      const response = await handleNLQExplain(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.query).toBe("find trading deals with $100 bonus");
      expect(body.parsed).toBeDefined();
      expect(body.parsed.intent).toBeDefined();
      expect(body.parsed.entities).toBeDefined();
      expect(body.structured).toBeDefined();
      expect(body.explanation).toBeDefined();
    });

    it("should handle GET request with query parameter", async () => {
      const request = new Request(
        "http://localhost/api/nlq/explain?q=trading+deals",
      );

      const response = await handleNLQExplain(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.query).toBe("trading deals");
    });

    it("should return 400 when query is missing in POST", async () => {
      const request = new Request("http://localhost/api/nlq/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await handleNLQExplain(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("MISSING_PARAMETER");
    });

    it("should return 400 when query is missing in GET", async () => {
      const request = new Request("http://localhost/api/nlq/explain");

      const response = await handleNLQExplain(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("MISSING_PARAMETER");
    });

    it("should handle invalid JSON in POST body", async () => {
      const request = new Request("http://localhost/api/nlq/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const response = await handleNLQExplain(request, mockEnv);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("PARSE_ERROR");
    });

    it("should include token details in explanation", async () => {
      const request = new Request("http://localhost/api/nlq/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "find deals" }),
      });

      const response = await handleNLQExplain(request, mockEnv);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.parsed.tokens).toBeDefined();
      expect(Array.isArray(body.parsed.tokens)).toBe(true);
    });

    it("should handle explain execution errors", async () => {
      vi.mocked(parseQuery).mockImplementationOnce(() => {
        throw new Error("Parse failure");
      });

      const request = new Request("http://localhost/api/nlq/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "bad query" }),
      });

      const response = await handleNLQExplain(request, mockEnv);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.code).toBe("EXPLAIN_ERROR");
    });
  });
});
