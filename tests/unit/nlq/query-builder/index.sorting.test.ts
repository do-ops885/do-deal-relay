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

describe("buildStructuredQuery - sorting and options", () => {
  let parsed: ParsedQuery;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetTopEntities.mockReturnValue([]);
    mockedExtractRankingCriteria.mockReturnValue(undefined);
    mockedIsRankingQuery.mockReturnValue(false);
    parsed = createParsedQuery();
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
