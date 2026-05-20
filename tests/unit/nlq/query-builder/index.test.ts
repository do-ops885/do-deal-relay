import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildStructuredQuery } from "../../../../worker/lib/nlq/query-builder/index";
import type {
  ParsedQuery,
  StructuredQuery,
  Token,
  ExtractedEntity,
  NLQConfig,
} from "../../../../worker/lib/nlq/types";

vi.mock("../../../../worker/lib/nlq/parser", () => ({
  getTopEntities: vi.fn(),
  cleanQueryForSearch: vi.fn(),
}));

vi.mock("../../../../worker/lib/nlq/intent", () => ({
  isRankingQuery: vi.fn(),
  extractRankingCriteria: vi.fn(),
}));

import { getTopEntities } from "../../../../worker/lib/nlq/parser";
import {
  isRankingQuery,
  extractRankingCriteria,
} from "../../../../worker/lib/nlq/intent";

const mockedGetTopEntities = vi.mocked(getTopEntities);
const mockedIsRankingQuery = vi.mocked(isRankingQuery);
const mockedExtractRankingCriteria = vi.mocked(extractRankingCriteria);

function mockGetTopEntities(type: string, entities: ExtractedEntity[]) {
  mockedGetTopEntities.mockImplementation(
    (_entities: ExtractedEntity[], entityType: string) => {
      if (entityType === type) return entities;
      return [];
    },
  );
}

function createParsedQuery(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return {
    originalText: "test query",
    cleanedText: "test query",
    tokens: [
      { value: "test", type: "word", position: 0, normalized: "test" },
      { value: "query", type: "word", position: 1, normalized: "query" },
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

describe("buildStructuredQuery", () => {
  let parsed: ParsedQuery;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetTopEntities.mockReturnValue([]);
    mockedExtractRankingCriteria.mockReturnValue(undefined);
    mockedIsRankingQuery.mockReturnValue(false);
    parsed = createParsedQuery();
  });

  describe("basic query structure", () => {
    it("should return a StructuredQuery object", () => {
      const result = buildStructuredQuery(parsed);
      expect(result).toHaveProperty("textQuery");
      expect(result).toHaveProperty("filters");
      expect(result).toHaveProperty("categories");
      expect(result).toHaveProperty("domains");
      expect(result).toHaveProperty("rewardTypes");
      expect(result).toHaveProperty("minRewardValue");
      expect(result).toHaveProperty("maxRewardValue");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("includeExpired");
      expect(result).toHaveProperty("sortBy");
      expect(result).toHaveProperty("sortOrder");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("offset");
    });

    it("should build FTS5 text query from word tokens", () => {
      parsed = createParsedQuery({
        tokens: [
          {
            value: "trading",
            type: "word",
            position: 0,
            normalized: "trading",
          },
          { value: "bonus", type: "word", position: 1, normalized: "bonus" },
        ],
      });
      const result = buildStructuredQuery(parsed);
      expect(result.textQuery).toBe("trading OR bonus");
    });

    it("should return single word text query when only one token", () => {
      parsed = createParsedQuery({
        tokens: [
          {
            value: "trading",
            type: "word",
            position: 0,
            normalized: "trading",
          },
        ],
      });
      const result = buildStructuredQuery(parsed);
      expect(result.textQuery).toBe("trading");
    });

    it("should exclude stopwords from text query", () => {
      parsed = createParsedQuery({
        tokens: [
          { value: "the", type: "word", position: 0, normalized: "the" },
          {
            value: "trading",
            type: "word",
            position: 1,
            normalized: "trading",
          },
        ],
      });
      const result = buildStructuredQuery(parsed);
      expect(result.textQuery).toBe("trading");
    });

    it("should exclude short tokens from text query", () => {
      parsed = createParsedQuery({
        tokens: [
          { value: "a", type: "word", position: 0, normalized: "a" },
          {
            value: "trading",
            type: "word",
            position: 1,
            normalized: "trading",
          },
        ],
      });
      const result = buildStructuredQuery(parsed);
      expect(result.textQuery).toBe("trading");
    });

    it("should return undefined text query when no meaningful tokens", () => {
      parsed = createParsedQuery({
        tokens: [
          { value: "the", type: "word", position: 0, normalized: "the" },
          { value: "is", type: "word", position: 1, normalized: "is" },
        ],
      });
      const result = buildStructuredQuery(parsed);
      expect(result.textQuery).toBeUndefined();
    });

    it("should exclude non-word tokens from text query", () => {
      parsed = createParsedQuery({
        tokens: [
          { value: "100", type: "number", position: 0, normalized: "100" },
          {
            value: "trading",
            type: "word",
            position: 1,
            normalized: "trading",
          },
        ],
      });
      const result = buildStructuredQuery(parsed);
      expect(result.textQuery).toBe("trading");
    });

    it("should deduplicate repeated words in text query", () => {
      parsed = createParsedQuery({
        tokens: [
          {
            value: "trading",
            type: "word",
            position: 0,
            normalized: "trading",
          },
          {
            value: "trading",
            type: "word",
            position: 1,
            normalized: "trading",
          },
          { value: "bonus", type: "word", position: 2, normalized: "bonus" },
        ],
      });
      const result = buildStructuredQuery(parsed);
      expect(result.textQuery).toBe("trading OR bonus");
    });

    it("should set default limit from config", () => {
      const result = buildStructuredQuery(parsed);
      expect(result.limit).toBe(20);
    });

    it("should set default offset to 0", () => {
      const result = buildStructuredQuery(parsed);
      expect(result.offset).toBe(0);
    });

    it("should set includeExpired to false by default", () => {
      const result = buildStructuredQuery(parsed);
      expect(result.includeExpired).toBe(false);
    });
  });

  describe("category extraction", () => {
    it("should extract categories from entities", () => {
      mockGetTopEntities("category", [
        { type: "category", value: "trading", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.categories).toEqual(["trading"]);
    });

    it("should extract multiple categories", () => {
      mockGetTopEntities("category", [
        { type: "category", value: "trading", confidence: 0.9 },
        { type: "category", value: "crypto", confidence: 0.85 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.categories).toEqual(["trading", "crypto"]);
    });

    it("should set undefined categories when none found", () => {
      mockGetTopEntities("category", []);
      const result = buildStructuredQuery(parsed);
      expect(result.categories).toBeUndefined();
    });
  });

  describe("domain extraction", () => {
    it("should extract domains from entities", () => {
      mockGetTopEntities("domain", [
        { type: "domain", value: "robinhood", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.domains).toEqual(["robinhood"]);
    });

    it("should extract multiple domains", () => {
      mockGetTopEntities("domain", [
        { type: "domain", value: "robinhood", confidence: 0.9 },
        { type: "domain", value: "webull", confidence: 0.85 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.domains).toEqual(["robinhood", "webull"]);
    });

    it("should set undefined domains when none found", () => {
      mockGetTopEntities("domain", []);
      const result = buildStructuredQuery(parsed);
      expect(result.domains).toBeUndefined();
    });
  });

  describe("reward type extraction", () => {
    it("should extract reward types from entities", () => {
      mockGetTopEntities("reward_type", [
        { type: "reward_type", value: "cash", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.rewardTypes).toEqual(["cash"]);
    });

    it("should extract multiple reward types", () => {
      mockGetTopEntities("reward_type", [
        { type: "reward_type", value: "cash", confidence: 0.9 },
        { type: "reward_type", value: "credit", confidence: 0.8 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.rewardTypes).toEqual(["cash", "credit"]);
    });

    it("should set undefined reward types when none found", () => {
      mockGetTopEntities("reward_type", []);
      const result = buildStructuredQuery(parsed);
      expect(result.rewardTypes).toBeUndefined();
    });
  });

  describe("reward value extraction", () => {
    it("should set minRewardValue for gte operator", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 50, operator: "gte", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.minRewardValue).toBe(50);
      expect(result.maxRewardValue).toBeUndefined();
    });

    it("should set minRewardValue for gt operator", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 50, operator: "gt", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.minRewardValue).toBe(50);
    });

    it("should set maxRewardValue for lte operator", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 200, operator: "lte", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.maxRewardValue).toBe(200);
      expect(result.minRewardValue).toBeUndefined();
    });

    it("should set maxRewardValue for lt operator", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 200, operator: "lt", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.maxRewardValue).toBe(200);
    });

    it("should set both min and max for eq operator", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 100, operator: "eq", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.minRewardValue).toBe(100);
      expect(result.maxRewardValue).toBe(100);
    });

    it("should default to gte operator when not specified", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 75, confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.minRewardValue).toBe(75);
    });

    it("should handle multiple reward value entities", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 50, operator: "gte", confidence: 0.9 },
        { type: "reward_value", value: 200, operator: "lte", confidence: 0.85 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.minRewardValue).toBe(50);
      expect(result.maxRewardValue).toBe(200);
    });

    it("should add filter conditions for reward values", () => {
      mockGetTopEntities("reward_value", [
        { type: "reward_value", value: 50, operator: "gte", confidence: 0.9 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.filters).toContainEqual({
        field: "reward_value",
        operator: "gte",
        value: 50,
      });
    });
  });

  describe("status extraction", () => {
    it("should extract active status", () => {
      mockGetTopEntities("status", [
        { type: "status", value: "active", confidence: 0.8 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.status).toBe("active");
    });

    it("should extract quarantined status", () => {
      mockGetTopEntities("status", [
        { type: "status", value: "quarantined", confidence: 0.8 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.status).toBe("quarantined");
    });

    it("should extract rejected status", () => {
      mockGetTopEntities("status", [
        { type: "status", value: "rejected", confidence: 0.8 },
      ]);
      const result = buildStructuredQuery(parsed);
      expect(result.status).toBe("rejected");
    });

    it("should default to active when no status entities", () => {
      mockGetTopEntities("status", []);
      const result = buildStructuredQuery(parsed);
      expect(result.status).toBe("active");
    });
  });

  describe("date expiry filters", () => {
    it("should add expiry_days filter from date entities", () => {
      mockedGetTopEntities.mockImplementation(
        (_entities: ExtractedEntity[], entityType: string) => {
          if (entityType === "date")
            return [
              {
                type: "date" as const,
                value: 7,
                operator: "lte" as const,
                confidence: 0.85,
              },
            ];
          return [];
        },
      );
      const result = buildStructuredQuery(parsed);
      expect(result.filters).toContainEqual({
        field: "expiry_days",
        operator: "lte",
        value: 7,
      });
    });

    it("should default operator to lte for date entities", () => {
      mockedGetTopEntities.mockImplementation(
        (_entities: ExtractedEntity[], entityType: string) => {
          if (entityType === "date")
            return [
              {
                type: "date" as const,
                value: 14,
                confidence: 0.85,
              },
            ];
          return [];
        },
      );
      const result = buildStructuredQuery(parsed);
      expect(result.filters).toContainEqual({
        field: "expiry_days",
        operator: "lte",
        value: 14,
      });
    });

    it("should handle multiple date entities", () => {
      mockedGetTopEntities.mockImplementation(
        (_entities: ExtractedEntity[], entityType: string) => {
          if (entityType === "date")
            return [
              {
                type: "date" as const,
                value: 30,
                operator: "lte" as const,
                confidence: 0.85,
              },
              {
                type: "date" as const,
                value: 7,
                operator: "gte" as const,
                confidence: 0.7,
              },
            ];
          return [];
        },
      );
      const result = buildStructuredQuery(parsed);
      const expiryFilters = result.filters.filter(
        (f) => f.field === "expiry_days",
      );
      expect(expiryFilters).toHaveLength(2);
    });
  });

  describe("ranking intent", () => {
    it("should sort by reward_value desc for highest bonus", () => {
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "highest bonus trading deals",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("reward_value");
      expect(result.sortOrder).toBe("desc");
    });

    it("should sort by reward_value desc for best reward", () => {
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "best reward deals",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("reward_value");
      expect(result.sortOrder).toBe("desc");
    });

    it("should sort by reward_value desc for most payout", () => {
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "most payout offers",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("reward_value");
      expect(result.sortOrder).toBe("desc");
    });

    it("should sort by confidence_score desc for most trusted", () => {
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "most trusted platforms",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("confidence_score");
      expect(result.sortOrder).toBe("desc");
    });

    it("should sort by confidence_score desc for highest confidence", () => {
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "highest confidence deals",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("confidence_score");
      expect(result.sortOrder).toBe("desc");
    });

    it("should use ranking criteria when explicitly extracted", () => {
      mockedExtractRankingCriteria.mockReturnValue("reward_value");
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "top deals by bonus",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("reward_value");
    });

    it("should use ranking criteria for confidence score", () => {
      mockedExtractRankingCriteria.mockReturnValue("confidence_score");
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "best rated deals",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("confidence_score");
    });

    it("should keep relevance sort when ranking query but no matching pattern", () => {
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "show me sorted results",
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("relevance");
    });
  });

  describe("comparison intent", () => {
    it("should sort by reward_value desc for compare intent", () => {
      parsed = createParsedQuery({
        intent: {
          intent: "compare",
          confidence: 0.88,
          keywords: ["compare"],
          originalQuery: "compare platforms",
        },
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("reward_value");
      expect(result.sortOrder).toBe("desc");
    });

    it("should not override existing sortBy from ranking criteria", () => {
      mockedExtractRankingCriteria.mockReturnValue("confidence_score");
      parsed = createParsedQuery({
        intent: {
          intent: "compare",
          confidence: 0.88,
          keywords: ["compare"],
          originalQuery: "compare platforms",
        },
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("confidence_score");
    });

    it("should not override existing sortBy from ranking patterns", () => {
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "most trusted platforms",
        intent: {
          intent: "search",
          confidence: 0.75,
          keywords: [],
          originalQuery: "most trusted platforms",
        },
      });
      const result = buildStructuredQuery(parsed);
      expect(result.sortBy).toBe("confidence_score");
    });
  });

  describe("options overrides", () => {
    it("should override default limit with options.limit", () => {
      const result = buildStructuredQuery(parsed, undefined, { limit: 5 });
      expect(result.limit).toBe(5);
    });

    it("should override default offset with options.offset", () => {
      const result = buildStructuredQuery(parsed, undefined, { offset: 10 });
      expect(result.offset).toBe(10);
    });

    it("should set includeExpired from options", () => {
      const result = buildStructuredQuery(parsed, undefined, {
        includeExpired: true,
      });
      expect(result.includeExpired).toBe(true);
    });

    it("should default includeExpired to false when not in options", () => {
      const result = buildStructuredQuery(parsed, undefined, {});
      expect(result.includeExpired).toBe(false);
    });

    it("should default offset to 0 when not in options", () => {
      const result = buildStructuredQuery(parsed, undefined, {});
      expect(result.offset).toBe(0);
    });

    it("should accept all options together", () => {
      const result = buildStructuredQuery(parsed, undefined, {
        limit: 10,
        offset: 5,
        includeExpired: true,
      });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
      expect(result.includeExpired).toBe(true);
    });
  });

  describe("entity extraction calls", () => {
    it("should call getTopEntities for categories", () => {
      buildStructuredQuery(parsed);
      expect(mockedGetTopEntities).toHaveBeenCalledWith(
        parsed.entities,
        "category",
      );
    });

    it("should call getTopEntities for domains", () => {
      buildStructuredQuery(parsed);
      expect(mockedGetTopEntities).toHaveBeenCalledWith(
        parsed.entities,
        "domain",
      );
    });

    it("should call getTopEntities for reward_type", () => {
      buildStructuredQuery(parsed);
      expect(mockedGetTopEntities).toHaveBeenCalledWith(
        parsed.entities,
        "reward_type",
      );
    });

    it("should call getTopEntities for reward_value", () => {
      buildStructuredQuery(parsed);
      expect(mockedGetTopEntities).toHaveBeenCalledWith(
        parsed.entities,
        "reward_value",
      );
    });

    it("should call getTopEntities for status", () => {
      buildStructuredQuery(parsed);
      expect(mockedGetTopEntities).toHaveBeenCalledWith(
        parsed.entities,
        "status",
      );
    });

    it("should call getTopEntities for date", () => {
      buildStructuredQuery(parsed);
      expect(mockedGetTopEntities).toHaveBeenCalledWith(
        parsed.entities,
        "date",
      );
    });
  });

  describe("all extraction combined", () => {
    it("should produce complete structured query with all fields", () => {
      mockedGetTopEntities.mockImplementation(
        (_entities: ExtractedEntity[], entityType: string) => {
          switch (entityType) {
            case "category":
              return [
                {
                  type: "category",
                  value: "trading",
                  confidence: 0.9,
                },
              ];
            case "domain":
              return [{ type: "domain", value: "robinhood", confidence: 0.9 }];
            case "reward_type":
              return [{ type: "reward_type", value: "cash", confidence: 0.9 }];
            case "reward_value":
              return [
                {
                  type: "reward_value",
                  value: 100,
                  operator: "gte",
                  confidence: 0.9,
                },
              ];
            case "status":
              return [{ type: "status", value: "active", confidence: 0.8 }];
            case "date":
              return [
                {
                  type: "date",
                  value: 7,
                  operator: "lte",
                  confidence: 0.85,
                },
              ];
            default:
              return [];
          }
        },
      );
      mockedIsRankingQuery.mockReturnValue(true);
      parsed = createParsedQuery({
        cleanedText: "highest bonus trading",
        tokens: [
          {
            value: "highest",
            type: "word",
            position: 0,
            normalized: "highest",
          },
          { value: "bonus", type: "word", position: 1, normalized: "bonus" },
          {
            value: "trading",
            type: "word",
            position: 2,
            normalized: "trading",
          },
        ],
      });
      const result = buildStructuredQuery(parsed, undefined, {
        limit: 5,
        offset: 10,
        includeExpired: true,
      });
      expect(result.categories).toEqual(["trading"]);
      expect(result.domains).toEqual(["robinhood"]);
      expect(result.rewardTypes).toEqual(["cash"]);
      expect(result.minRewardValue).toBe(100);
      expect(result.status).toBe("active");
      expect(result.sortBy).toBe("reward_value");
      expect(result.sortOrder).toBe("desc");
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(10);
      expect(result.includeExpired).toBe(true);
      expect(result.textQuery).toBe("highest OR bonus OR trading");
    });
  });
});
