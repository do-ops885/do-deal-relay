/**
 * NLQ Service Tests
 *
 * Tests for the NLQ service layer (service.ts).
 * Covers programmatic query execution and query parsing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KVNamespace, D1Database } from "@cloudflare/workers-types";
import {
  executeNLQ,
  parseNaturalLanguageQuery,
} from "../../../worker/routes/nlq/service";
import type { Env } from "../../../worker/types";

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
      intent: query.includes("compare")
        ? "compare"
        : query.includes("rank")
          ? "rank"
          : query.includes("how many")
            ? "count"
            : "search",
      confidence: 0.85,
      keywords: ["find", "search"],
      originalQuery: query,
    },
    entities: extractTestEntities(query),
  })),
}));

// Mock the query-builder
vi.mock("../../../worker/lib/nlq/query-builder", () => ({
  buildStructuredQuery: vi.fn(
    (
      _parsed: unknown,
      _config: unknown,
      options: {
        limit?: number;
        offset?: number;
        includeExpired?: boolean;
      } = {},
    ) => ({
      textQuery: "test",
      filters: [],
      categories: undefined,
      domains: undefined,
      rewardTypes: undefined,
      minRewardValue: undefined,
      maxRewardValue: undefined,
      status: "active",
      includeExpired: options.includeExpired ?? false,
      sortBy: "relevance",
      sortOrder: "desc",
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
    }),
  ),
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
    },
  ]),
}));

import { parseQuery } from "../../../worker/lib/nlq/parser";
import { executeStructuredQuery } from "../../../worker/lib/nlq/query-builder";

/**
 * Helper to extract test entities from query strings
 */
function extractTestEntities(query: string) {
  const entities: Array<{
    type: string;
    value: string | number;
    confidence: number;
  }> = [];

  // Extract dollar amounts
  const dollarMatch = query.match(/\$(\d+)/);
  if (dollarMatch) {
    entities.push({
      type: "reward_value",
      value: parseInt(dollarMatch[1], 10),
      confidence: 0.9,
    });
  }

  // Extract category keywords
  const categories = ["trading", "banking", "crypto", "gaming"];
  for (const cat of categories) {
    if (query.toLowerCase().includes(cat)) {
      entities.push({ type: "category", value: cat, confidence: 0.8 });
    }
  }

  return entities;
}

describe("NLQ Service", () => {
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      DEALS_DB: {} as D1Database,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  // ============================================================================
  // executeNLQ
  // ============================================================================

  describe("executeNLQ", () => {
    it("should return error when D1 database is not configured", async () => {
      const envWithoutDb = { ...mockEnv, DEALS_DB: undefined } as Env;

      const result = await executeNLQ(envWithoutDb, "find trading deals");

      expect(result.success).toBe(false);
      expect(result.query).toBe("find trading deals");
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.parsed.type).toBe("error");
    });

    it("should execute a simple search query successfully", async () => {
      const result = await executeNLQ(mockEnv, "find trading deals");

      expect(result.success).toBe(true);
      expect(result.query).toBe("find trading deals");
      expect(result.count).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.parsed.type).toBe("search");
      expect(result.parsed.intent.primary).toBe("search");
    });

    it("should parse entities from query with dollar amount", async () => {
      const result = await executeNLQ(mockEnv, "deals with $100 bonus");

      expect(result.success).toBe(true);
      expect(result.parsed.entities).toHaveLength(1);
      expect(result.parsed.entities[0].type).toBe("reward_value");
      expect(result.parsed.entities[0].value).toBe("100");
    });

    it("should parse category entities from query", async () => {
      const result = await executeNLQ(mockEnv, "crypto trading deals");

      expect(result.success).toBe(true);
      const entityTypes = result.parsed.entities.map((e) => e.type);
      expect(entityTypes).toContain("category");
    });

    it("should use default limit when not specified", async () => {
      await executeNLQ(mockEnv, "find deals");

      const callArgs = vi.mocked(executeStructuredQuery).mock.calls[0];
      const structuredQuery = callArgs[1];
      expect(structuredQuery.limit).toBe(20);
    });

    it("should respect custom limit parameter", async () => {
      vi.clearAllMocks();
      await executeNLQ(mockEnv, "find deals", 5);

      const callArgs = vi.mocked(executeStructuredQuery).mock.calls[0];
      const structuredQuery = callArgs[1];
      expect(structuredQuery.limit).toBe(5);
    });

    it("should return suggestions when no results found", async () => {
      vi.mocked(executeStructuredQuery).mockResolvedValueOnce([]);

      const result = await executeNLQ(mockEnv, "find nonexistent deals xyz");

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContain("Try broader terms");
      expect(result.suggestions).toContain("Check spelling");
      expect(result.suggestions).toContain("Use simpler keywords");
    });

    it("should not return suggestions when results are found", async () => {
      const result = await executeNLQ(mockEnv, "find trading deals");

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThan(0);
      expect(result.suggestions).toBeUndefined();
    });

    it("should handle compare intent classification", async () => {
      const result = await executeNLQ(mockEnv, "compare trading platforms");

      expect(result.success).toBe(true);
      expect(result.parsed.intent.primary).toBe("compare");
    });

    it("should handle rank intent classification", async () => {
      const result = await executeNLQ(mockEnv, "rank deals by bonus");

      expect(result.success).toBe(true);
      expect(result.parsed.intent.primary).toBe("rank");
    });

    it("should handle count intent classification", async () => {
      const result = await executeNLQ(mockEnv, "how many deals available");

      expect(result.success).toBe(true);
      expect(result.parsed.intent.primary).toBe("count");
    });

    it("should handle query execution errors gracefully", async () => {
      vi.mocked(executeStructuredQuery).mockRejectedValueOnce(
        new Error("Database timeout"),
      );

      const result = await executeNLQ(mockEnv, "find deals");

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.parsed.type).toBe("error");
    });

    it("should handle empty query string", async () => {
      const result = await executeNLQ(mockEnv, "");

      expect(result.success).toBe(true);
      expect(result.query).toBe("");
    });

    it("should handle whitespace-only query", async () => {
      const result = await executeNLQ(mockEnv, "   ");

      expect(result.success).toBe(true);
      expect(result.query).toBe("   ");
    });

    it("should return parsed intent confidence score", async () => {
      const result = await executeNLQ(mockEnv, "find trading deals");

      expect(result.parsed.intent.confidence).toBe(0.85);
    });

    it("should return entity confidence scores", async () => {
      const result = await executeNLQ(mockEnv, "deals with $50 bonus");

      expect(result.success).toBe(true);
      if (result.parsed.entities.length > 0) {
        expect(result.parsed.entities[0].confidence).toBe(0.9);
      }
    });

    it("should handle multiple category entities", async () => {
      const result = await executeNLQ(mockEnv, "crypto and banking deals");

      expect(result.success).toBe(true);
      const categoryEntities = result.parsed.entities.filter(
        (e) => e.type === "category",
      );
      expect(categoryEntities.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle very long query strings", async () => {
      const longQuery = "find ".repeat(100) + "trading deals";
      const result = await executeNLQ(mockEnv, longQuery);

      expect(result.success).toBe(true);
      expect(result.query).toBe(longQuery);
    });

    it("should handle special characters in query", async () => {
      const result = await executeNLQ(
        mockEnv,
        "find deals with $100+ bonus!!!",
      );

      expect(result.success).toBe(true);
      expect(result.query).toBe("find deals with $100+ bonus!!!");
    });

    it("should handle unicode characters in query", async () => {
      const result = await executeNLQ(mockEnv, "find deals with €100 bonus");

      expect(result.success).toBe(true);
      expect(result.query).toBe("find deals with €100 bonus");
    });
  });

  // ============================================================================
  // parseNaturalLanguageQuery
  // ============================================================================

  describe("parseNaturalLanguageQuery", () => {
    it("should parse a simple search query", () => {
      const result = parseNaturalLanguageQuery("find trading deals");

      expect(result.tokens).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.intent.intent).toBe("search");
    });

    it("should return tokens with value, type, and normalized fields", () => {
      const result = parseNaturalLanguageQuery("find $100 deals");

      expect(result.tokens.length).toBeGreaterThan(0);
      const token = result.tokens[0];
      expect(token).toHaveProperty("value");
      expect(token).toHaveProperty("type");
      expect(token).toHaveProperty("normalized");
    });

    it("should classify compare intent correctly", () => {
      const result = parseNaturalLanguageQuery(
        "compare platform A vs platform B",
      );

      expect(result.intent.intent).toBe("compare");
      expect(result.intent.confidence).toBe(0.85);
    });

    it("should extract reward value entities", () => {
      const result = parseNaturalLanguageQuery("deals with $50 bonus");

      const rewardEntities = result.entities.filter(
        (e) => e.type === "reward_value",
      );
      expect(rewardEntities.length).toBeGreaterThan(0);
      expect(rewardEntities[0].value).toBe(50);
    });

    it("should extract category entities", () => {
      const result = parseNaturalLanguageQuery("crypto trading platforms");

      const categoryEntities = result.entities.filter(
        (e) => e.type === "category",
      );
      expect(categoryEntities.length).toBeGreaterThan(0);
    });

    it("should handle empty query string", () => {
      const result = parseNaturalLanguageQuery("");

      expect(result.tokens).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.entities).toBeDefined();
    });

    it("should handle query with only stopwords", () => {
      const result = parseNaturalLanguageQuery("the a an is are");

      expect(result.tokens).toBeDefined();
      expect(result.intent).toBeDefined();
    });

    it("should preserve intent keywords from original query", () => {
      const result = parseNaturalLanguageQuery("find me the best deals");

      expect(result.intent.keywords).toBeDefined();
      expect(result.intent.intent).toBe("search");
    });

    it("should handle numeric tokens correctly", () => {
      const result = parseNaturalLanguageQuery("find 100 deals");

      const numberTokens = result.tokens.filter((t) => t.type === "number");
      expect(numberTokens.length).toBeGreaterThan(0);
      expect(numberTokens[0].value).toBe("100");
    });

    it("should handle mixed case queries", () => {
      const result = parseNaturalLanguageQuery("Find TRADING Deals");

      expect(result.tokens.some((t) => t.normalized === "trading")).toBe(true);
      expect(result.tokens.some((t) => t.normalized === "deals")).toBe(true);
    });

    it("should handle queries with punctuation", () => {
      const result = parseNaturalLanguageQuery("find deals, please!");

      expect(result.tokens).toBeDefined();
      expect(result.intent).toBeDefined();
    });

    it("should handle queries with multiple dollar amounts", () => {
      const result = parseNaturalLanguageQuery("deals with $50 to $200 bonus");

      const rewardEntities = result.entities.filter(
        (e) => e.type === "reward_value",
      );
      expect(rewardEntities.length).toBeGreaterThan(0);
    });

    it("should throw for undefined query input", () => {
      expect(() =>
        parseNaturalLanguageQuery(undefined as unknown as string),
      ).toThrow();
    });

    it("should handle intent keywords array", () => {
      const result = parseNaturalLanguageQuery("find trading deals");

      expect(result.intent.keywords).toBeDefined();
      expect(Array.isArray(result.intent.keywords)).toBe(true);
    });
  });
});
