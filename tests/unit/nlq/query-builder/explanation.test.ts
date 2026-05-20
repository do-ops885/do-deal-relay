import { describe, it, expect, vi, beforeEach } from "vitest";
import { explainQuery } from "../../../../worker/lib/nlq/query-builder/explanation";
import type {
  ParsedQuery,
  StructuredQuery,
  IntentClassification,
  Token,
  ExtractedEntity,
} from "../../../../worker/lib/nlq/types";

function createParsedQuery(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return {
    originalText: "test query",
    cleanedText: "test query",
    tokens: [
      {
        value: "test",
        type: "word",
        position: 0,
        normalized: "test",
      },
      {
        value: "query",
        type: "word",
        position: 1,
        normalized: "query",
      },
    ],
    entities: [],
    intent: {
      intent: "search",
      confidence: 0.85,
      keywords: ["find"],
      originalQuery: "test query",
    },
    ...overrides,
  };
}

function createStructuredQuery(
  overrides: Partial<StructuredQuery> = {},
): StructuredQuery {
  return {
    textQuery: "test",
    filters: [],
    categories: undefined,
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
    ...overrides,
  };
}

function makeParsedFromIntent(overrides: Partial<IntentClassification> = {}) {
  return createParsedQuery({
    intent: {
      intent: "search",
      confidence: 0.85,
      keywords: ["find"],
      originalQuery: "test query",
      ...overrides,
    },
  });
}

describe("explainQuery", () => {
  let parsed: ParsedQuery;
  let structured: StructuredQuery;

  beforeEach(() => {
    parsed = createParsedQuery();
    structured = createStructuredQuery();
  });

  it("should return intent from parsed query", () => {
    parsed = makeParsedFromIntent({ intent: "search", confidence: 0.9 });
    const result = explainQuery(parsed, structured);
    expect(result.intent).toBe("search");
    expect(result.intent_confidence).toBe(0.9);
  });

  it("should return intent_confidence from parsed query", () => {
    parsed = makeParsedFromIntent({ intent: "rank", confidence: 0.75 });
    const result = explainQuery(parsed, structured);
    expect(result.intent).toBe("rank");
    expect(result.intent_confidence).toBe(0.75);
  });

  it("should return entities_found count from parsed query", () => {
    parsed = createParsedQuery({
      entities: [
        {
          type: "category",
          value: "trading",
          confidence: 0.9,
        },
        {
          type: "domain",
          value: "example.com",
          confidence: 0.8,
        },
      ],
    });
    const result = explainQuery(parsed, structured);
    expect(result.entities_found).toBe(2);
  });

  it("should return zero entities_found when no entities", () => {
    parsed = createParsedQuery({ entities: [] });
    const result = explainQuery(parsed, structured);
    expect(result.entities_found).toBe(0);
  });

  it("should return sort_applied from structured query", () => {
    structured = createStructuredQuery({
      sortBy: "reward_value",
      sortOrder: "asc",
    });
    const result = explainQuery(parsed, structured);
    expect(result.sort_applied).toEqual({
      field: "reward_value",
      order: "asc",
    });
  });

  it("should return search text from structured query", () => {
    structured = createStructuredQuery({ textQuery: "trading bonus" });
    const result = explainQuery(parsed, structured);
    expect(result.search_text).toBe("trading bonus");
  });

  it("should return undefined search_text when no text query", () => {
    structured = createStructuredQuery({ textQuery: undefined });
    const result = explainQuery(parsed, structured);
    expect(result.search_text).toBeUndefined();
  });

  describe("filters_applied", () => {
    it("should return empty filters when none are set", () => {
      structured = createStructuredQuery({
        categories: undefined,
        domains: undefined,
        rewardTypes: undefined,
        minRewardValue: undefined,
        maxRewardValue: undefined,
        status: undefined,
        includeExpired: true,
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toEqual([]);
    });

    it("should include categories filter", () => {
      structured = createStructuredQuery({
        categories: ["trading", "crypto"],
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Categories: trading, crypto");
    });

    it("should include domains filter", () => {
      structured = createStructuredQuery({
        domains: ["example.com", "test.io"],
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Domains: example.com, test.io");
    });

    it("should include reward types filter", () => {
      structured = createStructuredQuery({
        rewardTypes: ["cash", "credit"],
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Reward types: cash, credit");
    });

    it("should include min reward value filter", () => {
      structured = createStructuredQuery({
        minRewardValue: 50,
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Minimum reward: $50");
    });

    it("should include max reward value filter", () => {
      structured = createStructuredQuery({
        maxRewardValue: 200,
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Maximum reward: $200");
    });

    it("should include both min and max reward value filters", () => {
      structured = createStructuredQuery({
        minRewardValue: 50,
        maxRewardValue: 200,
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Minimum reward: $50");
      expect(result.filters_applied).toContain("Maximum reward: $200");
    });

    it("should include status filter when status is not all", () => {
      structured = createStructuredQuery({ status: "quarantined" });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Status: quarantined");
    });

    it("should include status filter when status is active", () => {
      structured = createStructuredQuery({ status: "active" });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Status: active");
    });

    it("should not include status filter when status is all", () => {
      structured = createStructuredQuery({ status: "all" });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).not.toContain("Status: all");
    });

    it("should include active deals only filter when includeExpired is false", () => {
      structured = createStructuredQuery({ includeExpired: false });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toContain("Active deals only");
    });

    it("should not include active deals only filter when includeExpired is true", () => {
      structured = createStructuredQuery({ includeExpired: true });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).not.toContain("Active deals only");
    });

    it("should include all filter types when fully specified", () => {
      structured = createStructuredQuery({
        categories: ["trading"],
        domains: ["example.com"],
        rewardTypes: ["cash"],
        minRewardValue: 50,
        maxRewardValue: 200,
        status: "active",
        includeExpired: false,
      });
      const result = explainQuery(parsed, structured);
      expect(result.filters_applied).toEqual([
        "Categories: trading",
        "Domains: example.com",
        "Reward types: cash",
        "Minimum reward: $50",
        "Maximum reward: $200",
        "Status: active",
        "Active deals only",
      ]);
    });
  });

  describe("intent variations", () => {
    it("should explain compare intent", () => {
      parsed = makeParsedFromIntent({ intent: "compare", confidence: 0.88 });
      const result = explainQuery(parsed, structured);
      expect(result.intent).toBe("compare");
      expect(result.intent_confidence).toBe(0.88);
    });

    it("should explain rank intent", () => {
      parsed = makeParsedFromIntent({ intent: "rank", confidence: 0.92 });
      const result = explainQuery(parsed, structured);
      expect(result.intent).toBe("rank");
    });

    it("should explain filter intent", () => {
      parsed = makeParsedFromIntent({ intent: "filter", confidence: 0.7 });
      const result = explainQuery(parsed, structured);
      expect(result.intent).toBe("filter");
    });

    it("should explain suggest intent", () => {
      parsed = makeParsedFromIntent({ intent: "suggest", confidence: 0.65 });
      const result = explainQuery(parsed, structured);
      expect(result.intent).toBe("suggest");
    });

    it("should explain count intent", () => {
      parsed = makeParsedFromIntent({ intent: "count", confidence: 0.8 });
      const result = explainQuery(parsed, structured);
      expect(result.intent).toBe("count");
    });

    it("should explain unknown intent", () => {
      parsed = makeParsedFromIntent({ intent: "unknown", confidence: 0.3 });
      const result = explainQuery(parsed, structured);
      expect(result.intent).toBe("unknown");
    });
  });

  describe("entity count with real entities", () => {
    it("should count multiple entity types", () => {
      parsed = createParsedQuery({
        entities: [
          { type: "category", value: "trading", confidence: 0.9 },
          { type: "reward_type", value: "cash", confidence: 0.85 },
          { type: "reward_value", value: 100, confidence: 0.9 },
          { type: "domain", value: "robinhood", confidence: 0.7 },
          { type: "status", value: "active", confidence: 0.8 },
        ],
      });
      const result = explainQuery(parsed, structured);
      expect(result.entities_found).toBe(5);
    });

    it("should count single entity type", () => {
      parsed = createParsedQuery({
        entities: [{ type: "category", value: "crypto", confidence: 0.85 }],
      });
      const result = explainQuery(parsed, structured);
      expect(result.entities_found).toBe(1);
    });
  });
});
