import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeStructuredQuery } from "../../../../worker/lib/nlq/query-builder/executor";
import type { StructuredQuery } from "../../../../worker/lib/nlq/types";
import type { DealSearchResult } from "../../../../worker/lib/d1/types";

// ---------------------------------------------------------------------------
// Mocks — declared before vi.mock so the factory closures can reference them
// ---------------------------------------------------------------------------

const searchDealsMock = vi.fn<() => Promise<DealSearchResult[]>>();

const queryWithJsonMock = vi.fn();
const createD1ReadClientMock = vi.fn(() => ({
  queryWithJson: queryWithJsonMock,
}));

vi.mock("../../../../worker/lib/d1/queries", () => ({
  searchDeals: (...args: unknown[]) =>
    searchDealsMock(...(args as Parameters<typeof searchDealsMock>)),
}));

vi.mock("../../../../worker/lib/d1/client", () => ({
  createD1ReadClient: (...args: unknown[]) =>
    createD1ReadClientMock(
      ...(args as Parameters<typeof createD1ReadClientMock>),
    ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeal(overrides: Partial<DealSearchResult> = {}): DealSearchResult {
  return {
    id: 1,
    deal_id: "deal-1",
    title: "Acme Deal",
    description: "A deal",
    domain: "acme.com",
    code: "ACME10",
    url: "https://acme.com/deal",
    reward_type: "cash",
    reward_value: 50,
    reward_currency: "USD",
    status: "active",
    category: ["trading"],
    tags: ["bonus"],
    confidence_score: 0.8,
    ...overrides,
  };
}

function createBaseQuery(
  overrides: Partial<StructuredQuery> = {},
): StructuredQuery {
  return {
    textQuery: "test",
    filters: [],
    status: "active",
    includeExpired: false,
    sortBy: "relevance",
    sortOrder: "desc",
    limit: 20,
    offset: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeStructuredQuery", () => {
  const mockDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // FTS5 text path
  // ========================================================================
  describe("FTS5 text path (textQuery present)", () => {
    it("should call searchDeals with doubled limit", async () => {
      searchDealsMock.mockResolvedValue([]);
      const query = createBaseQuery({ limit: 10 });
      await executeStructuredQuery(mockDb, query);
      expect(searchDealsMock).toHaveBeenCalledWith(mockDb, "test", {
        limit: 20,
        includeExpired: false,
        status: "active",
      });
    });

    it("should filter by category (include matching, exclude non-matching)", async () => {
      const deal1 = makeDeal({ category: ["trading", "crypto"] });
      const deal2 = makeDeal({
        id: 2,
        deal_id: "deal-2",
        category: ["banking"],
      });
      searchDealsMock.mockResolvedValue([deal1, deal2]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          categories: ["trading"],
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.deal_id).toBe("deal-1");
    });

    it("should exclude deals with undefined category", async () => {
      const deal1 = makeDeal({ category: undefined as any });
      searchDealsMock.mockResolvedValue([deal1]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          categories: ["trading"],
        }),
      );

      expect(result).toHaveLength(0);
    });

    it("should perform case-insensitive domain filtering", async () => {
      const deal = makeDeal({ domain: "Acme.COM" });
      searchDealsMock.mockResolvedValue([deal]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          domains: ["acme.com"],
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.domain).toBe("Acme.COM");
    });

    it("should exclude non-matching domains", async () => {
      const deal1 = makeDeal({ domain: "acme.com" });
      const deal2 = makeDeal({ id: 2, deal_id: "d2", domain: "other.com" });
      searchDealsMock.mockResolvedValue([deal1, deal2]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          domains: ["acme.com"],
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.domain).toBe("acme.com");
    });

    it("should filter by reward type", async () => {
      const deal1 = makeDeal({ reward_type: "cash" });
      const deal2 = makeDeal({ id: 2, deal_id: "d2", reward_type: "credit" });
      searchDealsMock.mockResolvedValue([deal1, deal2]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          rewardTypes: ["cash"],
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.reward_type).toBe("cash");
    });

    it("should filter by min reward value", async () => {
      const deal1 = makeDeal({ reward_value: 100 });
      const deal2 = makeDeal({ id: 2, deal_id: "d2", reward_value: 10 });
      searchDealsMock.mockResolvedValue([deal1, deal2]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          minRewardValue: 50,
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.reward_value).toBe(100);
    });

    it("should filter by max reward value", async () => {
      const deal1 = makeDeal({ reward_value: 30 });
      const deal2 = makeDeal({ id: 2, deal_id: "d2", reward_value: 200 });
      searchDealsMock.mockResolvedValue([deal1, deal2]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          maxRewardValue: 50,
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.reward_value).toBe(30);
    });

    it("should filter by both min and max reward value", async () => {
      const d1 = makeDeal({ reward_value: 10 });
      const d2 = makeDeal({ id: 2, deal_id: "d2", reward_value: 75 });
      const d3 = makeDeal({ id: 3, deal_id: "d3", reward_value: 200 });
      searchDealsMock.mockResolvedValue([d1, d2, d3]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          minRewardValue: 50,
          maxRewardValue: 100,
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.reward_value).toBe(75);
    });

    describe("sorting", () => {
      it("should sort by confidence_score asc", async () => {
        const d1 = makeDeal({ confidence_score: 0.9 });
        const d2 = makeDeal({ id: 2, deal_id: "d2", confidence_score: 0.2 });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "confidence_score",
            sortOrder: "asc",
          }),
        );

        expect(result[0]!.confidence_score).toBe(0.2);
        expect(result[1]!.confidence_score).toBe(0.9);
      });

      it("should sort by confidence_score desc", async () => {
        const d1 = makeDeal({ confidence_score: 0.2 });
        const d2 = makeDeal({ id: 2, deal_id: "d2", confidence_score: 0.9 });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "confidence_score",
            sortOrder: "desc",
          }),
        );

        expect(result[0]!.confidence_score).toBe(0.9);
        expect(result[1]!.confidence_score).toBe(0.2);
      });

      it("should sort by reward_value asc", async () => {
        const d1 = makeDeal({ reward_value: 200 });
        const d2 = makeDeal({ id: 2, deal_id: "d2", reward_value: 10 });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "reward_value",
            sortOrder: "asc",
          }),
        );

        expect(result[0]!.reward_value).toBe(10);
        expect(result[1]!.reward_value).toBe(200);
      });

      it("should sort by reward_value desc", async () => {
        const d1 = makeDeal({ reward_value: 10 });
        const d2 = makeDeal({ id: 2, deal_id: "d2", reward_value: 200 });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "reward_value",
            sortOrder: "desc",
          }),
        );

        expect(result[0]!.reward_value).toBe(200);
        expect(result[1]!.reward_value).toBe(10);
      });

      it("should sort by title asc", async () => {
        const d1 = makeDeal({ title: "Zebra Deal" });
        const d2 = makeDeal({ id: 2, deal_id: "d2", title: "Alpha Deal" });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "title",
            sortOrder: "asc",
          }),
        );

        expect(result[0]!.title).toBe("Alpha Deal");
        expect(result[1]!.title).toBe("Zebra Deal");
      });

      it("should sort by title desc", async () => {
        const d1 = makeDeal({ title: "Alpha Deal" });
        const d2 = makeDeal({ id: 2, deal_id: "d2", title: "Zebra Deal" });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "title",
            sortOrder: "desc",
          }),
        );

        expect(result[0]!.title).toBe("Zebra Deal");
        expect(result[1]!.title).toBe("Alpha Deal");
      });

      it("should skip sorting when sortBy is relevance", async () => {
        const d1 = makeDeal({ title: "Zebra" });
        const d2 = makeDeal({ id: 2, deal_id: "d2", title: "Alpha" });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "relevance",
            sortOrder: "desc",
          }),
        );

        // Order preserved from searchDeals (no sort applied)
        expect(result[0]!.title).toBe("Zebra");
        expect(result[1]!.title).toBe("Alpha");
      });

      it("should handle missing confidence_score in sort (default to 0)", async () => {
        const d1 = makeDeal({ confidence_score: undefined as any });
        const d2 = makeDeal({ id: 2, deal_id: "d2", confidence_score: 0.5 });
        searchDealsMock.mockResolvedValue([d1, d2]);

        const result = await executeStructuredQuery(
          mockDb,
          createBaseQuery({
            sortBy: "confidence_score",
            sortOrder: "asc",
          }),
        );

        expect(result[0]!.confidence_score).toBeUndefined();
        expect(result[1]!.confidence_score).toBe(0.5);
      });
    });

    it("should apply pagination via slice", async () => {
      const deals = Array.from({ length: 10 }, (_, i) =>
        makeDeal({ id: i + 1, deal_id: `d${i + 1}` }),
      );
      searchDealsMock.mockResolvedValue(deals);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          limit: 3,
          offset: 2,
        }),
      );

      expect(result).toHaveLength(3);
      expect(result[0]!.deal_id).toBe("d3");
      expect(result[1]!.deal_id).toBe("d4");
      expect(result[2]!.deal_id).toBe("d5");
    });

    it("should return empty array when searchDeals returns empty", async () => {
      searchDealsMock.mockResolvedValue([]);

      const result = await executeStructuredQuery(mockDb, createBaseQuery());

      expect(result).toEqual([]);
    });

    it("should handle pagination when offset exceeds results", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ id: 1 }),
        makeDeal({ id: 2, deal_id: "d2" }),
      ]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          limit: 10,
          offset: 100,
        }),
      );

      expect(result).toEqual([]);
    });

    it("should pass includeExpired and status through to searchDeals", async () => {
      searchDealsMock.mockResolvedValue([]);
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          includeExpired: true,
          status: "quarantined",
        }),
      );

      expect(searchDealsMock).toHaveBeenCalledWith(mockDb, "test", {
        limit: 40,
        includeExpired: true,
        status: "quarantined",
      });
    });

    it("should combine multiple filters together", async () => {
      const d1 = makeDeal({
        category: ["trading"],
        domain: "acme.com",
        reward_type: "cash",
        reward_value: 100,
      });
      const d2 = makeDeal({
        id: 2,
        deal_id: "d2",
        category: ["trading"],
        domain: "acme.com",
        reward_type: "cash",
        reward_value: 5,
      });
      const d3 = makeDeal({
        id: 3,
        deal_id: "d3",
        category: ["banking"],
        domain: "other.com",
        reward_type: "credit",
        reward_value: 50,
      });
      searchDealsMock.mockResolvedValue([d1, d2, d3]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          categories: ["trading"],
          domains: ["acme.com"],
          rewardTypes: ["cash"],
          minRewardValue: 50,
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.deal_id).toBe("deal-1");
    });
  });

  // ========================================================================
  // Filter-only path (no textQuery)
  // ========================================================================
  describe("filter-only path (no textQuery)", () => {
    beforeEach(() => {
      // Reset the shared mock to return a default successful response
      queryWithJsonMock.mockResolvedValue({ success: true, data: [] });
    });

    it("should call executeFilterOnlyQuery when textQuery is undefined", async () => {
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
        }),
      );

      expect(createD1ReadClientMock).toHaveBeenCalledWith(mockDb);
      expect(queryWithJsonMock).toHaveBeenCalled();
    });

    it("should build correct SQL with WHERE and ORDER BY", async () => {
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
          categories: ["trading"],
          sortBy: "confidence_score",
          sortOrder: "desc",
        }),
      );

      const [sql] = queryWithJsonMock.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("WHERE 1=1");
      expect(sql).toContain("ORDER BY");
    });

    it("should replace fts.rank with confidence_score DESC", async () => {
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
          sortBy: "relevance",
        }),
      );

      const [sql] = queryWithJsonMock.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain("fts.rank");
      expect(sql).toContain("d.confidence_score DESC");
    });

    it("should append LIMIT and OFFSET", async () => {
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
          limit: 10,
          offset: 5,
        }),
      );

      const [sql, params] = queryWithJsonMock.mock.calls[0] as [
        string,
        number[],
      ];
      expect(sql).toContain("LIMIT ?");
      expect(sql).toContain("OFFSET ?");
      expect(params).toContain(10);
      expect(params).toContain(5);
    });

    it("should return parsed results on success", async () => {
      const mockDeals = [makeDeal({ id: 10, deal_id: "d10" })];
      queryWithJsonMock.mockResolvedValue({
        success: true,
        data: mockDeals,
      });

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
        }),
      );

      expect(result).toEqual(mockDeals);
    });

    it("should return empty array on query failure", async () => {
      queryWithJsonMock.mockResolvedValue({
        success: false,
        error: "query failed",
      });

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
        }),
      );

      expect(result).toEqual([]);
    });

    it("should return empty array when data is undefined on success", async () => {
      queryWithJsonMock.mockResolvedValue({
        success: true,
      });

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
        }),
      );

      expect(result).toEqual([]);
    });

    it("should pass category and tags as JSON columns", async () => {
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
        }),
      );

      const [, , jsonCols] = queryWithJsonMock.mock.calls[0] as [
        string,
        unknown[],
        string[],
      ];
      expect(jsonCols).toEqual(["category", "tags"]);
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================
  describe("edge cases", () => {
    it("should handle undefined filter arrays gracefully", async () => {
      searchDealsMock.mockResolvedValue([makeDeal()]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          categories: undefined,
          domains: undefined,
          rewardTypes: undefined,
          minRewardValue: undefined,
          maxRewardValue: undefined,
        }),
      );

      expect(result).toHaveLength(1);
    });

    it("should handle empty results with all filters", async () => {
      searchDealsMock.mockResolvedValue([]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          categories: ["trading"],
          domains: ["acme.com"],
          rewardTypes: ["cash"],
          minRewardValue: 100,
          maxRewardValue: 200,
        }),
      );

      expect(result).toEqual([]);
    });

    it("should handle empty category array (no category filter applied)", async () => {
      const d1 = makeDeal({ category: ["trading"] });
      searchDealsMock.mockResolvedValue([d1]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          categories: [],
        }),
      );

      expect(result).toHaveLength(1);
    });

    it("should handle empty domains array (no domain filter applied)", async () => {
      const d1 = makeDeal();
      searchDealsMock.mockResolvedValue([d1]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          domains: [],
        }),
      );

      expect(result).toHaveLength(1);
    });

    it("should handle empty rewardTypes array (no reward filter applied)", async () => {
      const d1 = makeDeal();
      searchDealsMock.mockResolvedValue([d1]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          rewardTypes: [],
        }),
      );

      expect(result).toHaveLength(1);
    });

    it("should handle filter-only path with undefined filter arrays", async () => {
      queryWithJsonMock.mockResolvedValue({ success: true, data: [] });

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          textQuery: undefined,
          categories: undefined,
          domains: undefined,
          rewardTypes: undefined,
        }),
      );

      expect(result).toEqual([]);
      expect(queryWithJsonMock).toHaveBeenCalled();
    });

    it("should handle all filter fields set with no matching deals", async () => {
      searchDealsMock.mockResolvedValue([makeDeal({ reward_value: 1 })]);

      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({
          categories: ["nonexistent"],
          domains: ["nope.com"],
          rewardTypes: ["item"],
          minRewardValue: 999,
          maxRewardValue: 9999,
        }),
      );

      expect(result).toEqual([]);
    });
  });
});
