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

describe("executeStructuredQuery - FTS5 text path", () => {
  const mockDb = {} as any;
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call searchDeals with doubled limit", async () => {
    searchDealsMock.mockResolvedValue([]);
    await executeStructuredQuery(mockDb, createBaseQuery({ limit: 10 }));
    expect(searchDealsMock).toHaveBeenCalledWith(mockDb, "test", {
      limit: 20,
      includeExpired: false,
      status: "active",
    });
  });

  it("should filter by category (include matching, exclude non-matching)", async () => {
    const deal1 = makeDeal({ category: ["trading", "crypto"] });
    const deal2 = makeDeal({ id: 2, deal_id: "deal-2", category: ["banking"] });
    searchDealsMock.mockResolvedValue([deal1, deal2]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ categories: ["trading"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.deal_id).toBe("deal-1");
  });

  it("should exclude deals with undefined category", async () => {
    searchDealsMock.mockResolvedValue([
      makeDeal({ category: undefined as any }),
    ]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ categories: ["trading"] }),
    );
    expect(result).toHaveLength(0);
  });

  it("should perform case-insensitive domain filtering", async () => {
    searchDealsMock.mockResolvedValue([makeDeal({ domain: "Acme.COM" })]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ domains: ["acme.com"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.domain).toBe("Acme.COM");
  });

  it("should exclude non-matching domains", async () => {
    searchDealsMock.mockResolvedValue([
      makeDeal({ domain: "acme.com" }),
      makeDeal({ id: 2, deal_id: "d2", domain: "other.com" }),
    ]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ domains: ["acme.com"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.domain).toBe("acme.com");
  });

  it("should filter by reward type", async () => {
    searchDealsMock.mockResolvedValue([
      makeDeal({ reward_type: "cash" }),
      makeDeal({ id: 2, deal_id: "d2", reward_type: "credit" }),
    ]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ rewardTypes: ["cash"] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.reward_type).toBe("cash");
  });

  it("should filter by min reward value", async () => {
    searchDealsMock.mockResolvedValue([
      makeDeal({ reward_value: 100 }),
      makeDeal({ id: 2, deal_id: "d2", reward_value: 10 }),
    ]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ minRewardValue: 50 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.reward_value).toBe(100);
  });

  it("should filter by max reward value", async () => {
    searchDealsMock.mockResolvedValue([
      makeDeal({ reward_value: 30 }),
      makeDeal({ id: 2, deal_id: "d2", reward_value: 200 }),
    ]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ maxRewardValue: 50 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.reward_value).toBe(30);
  });

  it("should filter by both min and max reward value", async () => {
    searchDealsMock.mockResolvedValue([
      makeDeal({ reward_value: 10 }),
      makeDeal({ id: 2, deal_id: "d2", reward_value: 75 }),
      makeDeal({ id: 3, deal_id: "d3", reward_value: 200 }),
    ]);
    const result = await executeStructuredQuery(
      mockDb,
      createBaseQuery({ minRewardValue: 50, maxRewardValue: 100 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.reward_value).toBe(75);
  });

  describe("sorting", () => {
    it("should sort by confidence_score asc", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ confidence_score: 0.9 }),
        makeDeal({ id: 2, deal_id: "d2", confidence_score: 0.2 }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "confidence_score", sortOrder: "asc" }),
      );
      expect(result[0]!.confidence_score).toBe(0.2);
      expect(result[1]!.confidence_score).toBe(0.9);
    });

    it("should sort by confidence_score desc", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ confidence_score: 0.2 }),
        makeDeal({ id: 2, deal_id: "d2", confidence_score: 0.9 }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "confidence_score", sortOrder: "desc" }),
      );
      expect(result[0]!.confidence_score).toBe(0.9);
      expect(result[1]!.confidence_score).toBe(0.2);
    });

    it("should sort by reward_value asc", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ reward_value: 200 }),
        makeDeal({ id: 2, deal_id: "d2", reward_value: 10 }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "reward_value", sortOrder: "asc" }),
      );
      expect(result[0]!.reward_value).toBe(10);
      expect(result[1]!.reward_value).toBe(200);
    });

    it("should sort by reward_value desc", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ reward_value: 10 }),
        makeDeal({ id: 2, deal_id: "d2", reward_value: 200 }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "reward_value", sortOrder: "desc" }),
      );
      expect(result[0]!.reward_value).toBe(200);
      expect(result[1]!.reward_value).toBe(10);
    });

    it("should sort by title asc", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ title: "Zebra Deal" }),
        makeDeal({ id: 2, deal_id: "d2", title: "Alpha Deal" }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "title", sortOrder: "asc" }),
      );
      expect(result[0]!.title).toBe("Alpha Deal");
      expect(result[1]!.title).toBe("Zebra Deal");
    });

    it("should sort by title desc", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ title: "Alpha Deal" }),
        makeDeal({ id: 2, deal_id: "d2", title: "Zebra Deal" }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "title", sortOrder: "desc" }),
      );
      expect(result[0]!.title).toBe("Zebra Deal");
      expect(result[1]!.title).toBe("Alpha Deal");
    });

    it("should skip sorting when sortBy is relevance", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ title: "Zebra" }),
        makeDeal({ id: 2, deal_id: "d2", title: "Alpha" }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "relevance", sortOrder: "desc" }),
      );
      expect(result[0]!.title).toBe("Zebra");
      expect(result[1]!.title).toBe("Alpha");
    });

    it("should handle missing confidence_score in sort (default to 0)", async () => {
      searchDealsMock.mockResolvedValue([
        makeDeal({ confidence_score: undefined as any }),
        makeDeal({ id: 2, deal_id: "d2", confidence_score: 0.5 }),
      ]);
      const result = await executeStructuredQuery(
        mockDb,
        createBaseQuery({ sortBy: "confidence_score", sortOrder: "asc" }),
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
      createBaseQuery({ limit: 3, offset: 2 }),
    );
    expect(result).toHaveLength(3);
    expect(result[0]!.deal_id).toBe("d3");
  });

  it("should return empty array when searchDeals returns empty", async () => {
    searchDealsMock.mockResolvedValue([]);
    expect(await executeStructuredQuery(mockDb, createBaseQuery())).toEqual([]);
  });

  it("should handle pagination when offset exceeds results", async () => {
    searchDealsMock.mockResolvedValue([
      makeDeal({ id: 1 }),
      makeDeal({ id: 2, deal_id: "d2" }),
    ]);
    expect(
      await executeStructuredQuery(
        mockDb,
        createBaseQuery({ limit: 10, offset: 100 }),
      ),
    ).toEqual([]);
  });

  it("should pass includeExpired and status through to searchDeals", async () => {
    searchDealsMock.mockResolvedValue([]);
    await executeStructuredQuery(
      mockDb,
      createBaseQuery({ includeExpired: true, status: "quarantined" }),
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
