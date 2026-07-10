import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeStructuredQuery } from "../../../../worker/lib/nlq/query-builder/executor";
import type { StructuredQuery } from "../../../../worker/lib/nlq/types";
import type { DealSearchResult } from "../../../../worker/lib/d1/types";

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

describe("executeStructuredQuery - filter-only path", () => {
  const mockDb = {} as any;
  beforeEach(() => {
    vi.clearAllMocks();
    queryWithJsonMock.mockResolvedValue({ success: true, data: [] });
  });

  it("should call executeFilterOnlyQuery when textQuery is undefined", async () => {
    await executeStructuredQuery(
      mockDb,
      createBaseQuery({ textQuery: undefined }),
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
      createBaseQuery({ textQuery: undefined, sortBy: "relevance" }),
    );
    const [sql] = queryWithJsonMock.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("fts.rank");
    expect(sql).toContain("d.confidence_score DESC");
  });

  it("should append LIMIT and OFFSET", async () => {
    await executeStructuredQuery(
      mockDb,
      createBaseQuery({ textQuery: undefined, limit: 10, offset: 5 }),
    );
    const [sql, params] = queryWithJsonMock.mock.calls[0] as [string, number[]];
    expect(sql).toContain("LIMIT ?");
    expect(sql).toContain("OFFSET ?");
    expect(params).toContain(10);
    expect(params).toContain(5);
  });

  it("should return parsed results on success", async () => {
    const mockDeals = [makeDeal({ id: 10, deal_id: "d10" })];
    queryWithJsonMock.mockResolvedValue({ success: true, data: mockDeals });
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ textQuery: undefined }),
    );
    expect(result).toEqual(mockDeals);
  });

  it("should return empty array on query failure", async () => {
    queryWithJsonMock.mockResolvedValue({
      success: false,
      error: "query failed",
    });
    expect(
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({ textQuery: undefined }),
      ),
    ).toEqual([]);
  });

  it("should return empty array when data is undefined on success", async () => {
    queryWithJsonMock.mockResolvedValue({ success: true });
    expect(
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({ textQuery: undefined }),
      ),
    ).toEqual([]);
  });

  it("should pass category and tags as JSON columns", async () => {
    await executeStructuredQuery(
      mockDb,
      createBaseQuery({ textQuery: undefined }),
    );
    const [, , jsonCols] = queryWithJsonMock.mock.calls[0] as [
      string,
      unknown[],
      string[],
    ];
    expect(jsonCols).toEqual(["category", "tags"]);
  });
});

describe("executeStructuredQuery - edge cases", () => {
  const mockDb = {} as any;
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    searchDealsMock.mockResolvedValue([makeDeal()]);
    expect(
      await executeStructuredQuery(mockDb, createBaseQuery({ categories: [] })),
    ).toHaveLength(1);
  });

  it("should handle empty domains array (no domain filter applied)", async () => {
    searchDealsMock.mockResolvedValue([makeDeal()]);
    expect(
      await executeStructuredQuery(mockDb, createBaseQuery({ domains: [] })),
    ).toHaveLength(1);
  });

  it("should handle empty rewardTypes array (no reward filter applied)", async () => {
    searchDealsMock.mockResolvedValue([makeDeal()]);
    expect(
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({ rewardTypes: [] }),
      ),
    ).toHaveLength(1);
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
