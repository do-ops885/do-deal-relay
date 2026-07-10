/**
 * Unit Tests for D1 Queries — Search & Listing
 * searchDeals, getSearchSuggestions, getDealsByDomain, getDealsByCategory,
 * getDomainsWithCounts, getCategoriesWithCounts, getActiveDeals,
 * getExpiringDeals, getRecentDeals
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  searchDeals,
  getSearchSuggestions,
  getDealsByDomain,
  getDealsByCategory,
  getDomainsWithCounts,
  getCategoriesWithCounts,
  getActiveDeals,
  getExpiringDeals,
  getRecentDeals,
  type DealSearchResult,
  type ExpiringDealRow,
} from "../../worker/lib/d1/queries";

// Mock Factory
const createMockStatement = () => ({
  bind: vi.fn().mockReturnThis(),
  all: vi.fn().mockResolvedValue({ results: [], meta: {} }),
  first: vi.fn().mockResolvedValue(null),
  run: vi.fn().mockResolvedValue({ results: [], meta: {} }),
});

let currentMockStatement = createMockStatement();
let currentMockSession: ReturnType<typeof createMockSession> | null = null;

const createMockSession = () => ({
  prepare: vi.fn().mockImplementation(() => currentMockStatement),
  getBookmark: vi.fn().mockReturnValue("test-bookmark"),
});

const createMockD1 = () => {
  currentMockStatement = createMockStatement();
  currentMockSession = createMockSession();
  return {
    prepare: vi.fn().mockImplementation(() => currentMockStatement),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn().mockResolvedValue(undefined),
    withSession: vi.fn().mockImplementation(() => currentMockSession),
  };
};

const createMockDeal = (
  overrides: Partial<DealSearchResult> = {},
): DealSearchResult => ({
  id: 1,
  deal_id: "deal-001",
  title: "Test Deal",
  description: "A test deal description",
  domain: "example.com",
  code: "TESTCODE",
  url: "https://example.com/deal",
  reward_type: "cash",
  reward_value: 50,
  reward_currency: "USD",
  status: "active",
  category: ["test", "demo"],
  tags: ["new", "hot"],
  confidence_score: 0.85,
  ...overrides,
});

describe("D1 Queries — Search & Listing", () => {
  let mockDb: ReturnType<typeof createMockD1>;
  const getMockStatement = () => currentMockStatement;
  const getSessionPrepareCalls = () => {
    if (!currentMockSession) return [];
    return currentMockSession.prepare.mock.calls;
  };
  const getLastSessionQuery = () => {
    const calls = getSessionPrepareCalls();
    if (calls.length === 0) return null;
    return calls[calls.length - 1]![0] as string;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockD1();
  });

  describe("searchDeals", () => {
    it("should return deals matching search query", async () => {
      const mockDeals = [
        createMockDeal(),
        createMockDeal({ id: 2, deal_id: "deal-002" }),
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockDeals,
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });
      const results = await searchDeals(
        mockDb as unknown as D1Database,
        "test",
      );
      expect(mockDb.withSession).toHaveBeenCalled();
      expect(getMockStatement().bind).toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0]!.deal_id).toBe("deal-001");
    });

    it("should filter by status when provided", async () => {
      const mockDeals = [createMockDeal({ status: "quarantined" })];
      getMockStatement().run.mockResolvedValue({
        results: mockDeals,
        success: true,
        meta: { rows_read: 1, rows_written: 0 },
      });
      const results = await searchDeals(
        mockDb as unknown as D1Database,
        "test",
        {
          status: "quarantined",
        },
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("quarantined");
    });

    it("should include expired deals when includeExpired is true", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await searchDeals(mockDb as unknown as D1Database, "test", {
        includeExpired: true,
      });
      const prepareCall = getLastSessionQuery();
      expect(prepareCall).not.toContain("expiry_date IS NULL OR expiry_date >");
    });

    it("should respect limit option", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await searchDeals(mockDb as unknown as D1Database, "test", { limit: 5 });
      const bindCalls = getMockStatement().bind.mock.calls;
      const lastCall = bindCalls[bindCalls.length - 1];
      expect(lastCall).toContain(5);
    });

    it("should return empty array on database error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await searchDeals(
        mockDb as unknown as D1Database,
        "test",
      );
      expect(results).toEqual([]);
    });

    it("should handle empty results", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      const results = await searchDeals(
        mockDb as unknown as D1Database,
        "nonexistent",
      );
      expect(results).toEqual([]);
    });
  });

  describe("getSearchSuggestions", () => {
    it("should return title suggestions", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [{ title: "Deal One" }, { title: "Deal Two" }],
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });
      const suggestions = await getSearchSuggestions(
        mockDb as unknown as D1Database,
        "dea",
      );
      expect(suggestions).toEqual(["Deal One", "Deal Two"]);
    });

    it("should filter out null titles", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [
          { title: "Deal One" },
          { title: null },
          { title: "Deal Three" },
        ],
        success: true,
        meta: { rows_read: 3, rows_written: 0 },
      });
      const suggestions = await getSearchSuggestions(
        mockDb as unknown as D1Database,
        "dea",
      );
      expect(suggestions).toEqual(["Deal One", "Deal Three"]);
    });

    it("should respect limit parameter", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getSearchSuggestions(mockDb as unknown as D1Database, "dea", 5);
      expect(getMockStatement().bind).toHaveBeenCalledWith("dea", 5);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const suggestions = await getSearchSuggestions(
        mockDb as unknown as D1Database,
        "test",
      );
      expect(suggestions).toEqual([]);
    });
  });

  describe("getDealsByDomain", () => {
    it("should return deals for specific domain", async () => {
      const mockDeals = [
        createMockDeal({ domain: "test.com" }),
        createMockDeal({ id: 2, domain: "test.com", deal_id: "deal-002" }),
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockDeals,
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });
      const results = await getDealsByDomain(
        mockDb as unknown as D1Database,
        "test.com",
      );
      expect(getMockStatement().bind).toHaveBeenCalledWith(
        "test.com",
        expect.any(Number),
      );
      expect(results).toHaveLength(2);
      expect(results[0]!.domain).toBe("test.com");
    });

    it("should include inactive deals when activeOnly is false", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getDealsByDomain(mockDb as unknown as D1Database, "test.com", {
        activeOnly: false,
      });
      const prepareCall = getLastSessionQuery();
      expect(prepareCall).not.toContain("is_active = 1 AND status = 'active'");
    });

    it("should respect limit option", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getDealsByDomain(mockDb as unknown as D1Database, "test.com", {
        limit: 10,
      });
      const bindCalls = getMockStatement().bind.mock.calls;
      const lastCall = bindCalls[bindCalls.length - 1];
      expect(lastCall).toContain(10);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await getDealsByDomain(
        mockDb as unknown as D1Database,
        "test.com",
      );
      expect(results).toEqual([]);
    });
  });

  describe("getDealsByCategory", () => {
    it("should return deals in specific category", async () => {
      const mockDeals = [createMockDeal({ category: ["finance", "crypto"] })];
      getMockStatement().run.mockResolvedValue({
        results: mockDeals,
        success: true,
        meta: { rows_read: 1, rows_written: 0 },
      });
      const results = await getDealsByCategory(
        mockDb as unknown as D1Database,
        "finance",
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.category).toContain("finance");
    });

    it("should filter by active status by default", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getDealsByCategory(mockDb as unknown as D1Database, "finance");
      const bindCalls = getMockStatement().bind.mock.calls[0];
      expect(bindCalls).toContain(1);
    });

    it("should include inactive when activeOnly is false", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getDealsByCategory(mockDb as unknown as D1Database, "finance", {
        activeOnly: false,
      });
      const bindCalls = getMockStatement().bind.mock.calls[0];
      expect(bindCalls).toContain(0);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await getDealsByCategory(
        mockDb as unknown as D1Database,
        "finance",
      );
      expect(results).toEqual([]);
    });
  });

  describe("getDomainsWithCounts", () => {
    it("should return domains with deal counts", async () => {
      const mockDomains = [
        { domain: "example.com", count: 5 },
        { domain: "test.com", count: 3 },
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockDomains,
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });
      const results = await getDomainsWithCounts(
        mockDb as unknown as D1Database,
      );
      expect(results).toHaveLength(2);
      expect(results[0]!.domain).toBe("example.com");
      expect(results[0]!.count).toBe(5);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await getDomainsWithCounts(
        mockDb as unknown as D1Database,
      );
      expect(results).toEqual([]);
    });
  });

  describe("getCategoriesWithCounts", () => {
    it("should parse JSON categories and count them", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [
          { categories: '["finance", "crypto"]' },
          { categories: '["finance", "trading"]' },
        ],
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });
      const results = await getCategoriesWithCounts(
        mockDb as unknown as D1Database,
      );
      expect(results).toContainEqual({ name: "finance", count: 2 });
      expect(results).toContainEqual({ name: "crypto", count: 1 });
      expect(results).toContainEqual({ name: "trading", count: 1 });
    });

    it("should handle comma-separated categories as fallback", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [{ categories: "finance, crypto, trading" }],
        success: true,
        meta: { rows_read: 1, rows_written: 0 },
      });
      const results = await getCategoriesWithCounts(
        mockDb as unknown as D1Database,
      );
      expect(results).toContainEqual({ name: "finance", count: 1 });
      expect(results).toContainEqual({ name: "crypto", count: 1 });
      expect(results).toContainEqual({ name: "trading", count: 1 });
    });

    it("should sort by count descending", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [
          { categories: '["popular"]' },
          { categories: '["popular", "rare"]' },
          { categories: '["popular"]' },
        ],
        success: true,
        meta: { rows_read: 3, rows_written: 0 },
      });
      const results = await getCategoriesWithCounts(
        mockDb as unknown as D1Database,
      );
      expect(results[0]!.name).toBe("popular");
      expect(results[0]!.count).toBe(3);
    });

    it("should return empty array on database error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await getCategoriesWithCounts(
        mockDb as unknown as D1Database,
      );
      expect(results).toEqual([]);
    });

    it("should return empty array when no categories found", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      const results = await getCategoriesWithCounts(
        mockDb as unknown as D1Database,
      );
      expect(results).toEqual([]);
    });
  });

  describe("getActiveDeals", () => {
    it("should return only active deals", async () => {
      const mockDeals = [
        createMockDeal(),
        createMockDeal({ id: 2, deal_id: "deal-002" }),
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockDeals,
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });
      const results = await getActiveDeals(mockDb as unknown as D1Database);
      expect(results).toHaveLength(2);
      expect(getMockStatement().bind).toHaveBeenCalledWith(expect.any(Number));
    });

    it("should respect limit parameter", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getActiveDeals(mockDb as unknown as D1Database, 25);
      expect(getMockStatement().bind).toHaveBeenCalledWith(25);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await getActiveDeals(mockDb as unknown as D1Database);
      expect(results).toEqual([]);
    });
  });

  describe("getExpiringDeals", () => {
    it("should return deals expiring within specified days", async () => {
      const mockDeals: ExpiringDealRow[] = [
        {
          id: 1,
          deal_id: "deal-001",
          title: "Expiring Soon",
          domain: "test.com",
          expiry_date: new Date(Date.now() + 86400000).toISOString(),
          days_remaining: 1,
          code: "EXPIRING",
        },
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockDeals,
        success: true,
        meta: { rows_read: 1, rows_written: 0 },
      });
      const results = await getExpiringDeals(
        mockDb as unknown as D1Database,
        7,
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.days_remaining).toBe(1);
    });

    it("should default to 7 days", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getExpiringDeals(mockDb as unknown as D1Database);
      expect(getMockStatement().bind).toHaveBeenCalledWith(7);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await getExpiringDeals(mockDb as unknown as D1Database);
      expect(results).toEqual([]);
    });
  });

  describe("getRecentDeals", () => {
    it("should return deals added within specified days", async () => {
      const mockDeals = [
        createMockDeal(),
        createMockDeal({ id: 2, deal_id: "deal-002" }),
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockDeals,
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });
      const results = await getRecentDeals(
        mockDb as unknown as D1Database,
        7,
        50,
      );
      expect(results).toHaveLength(2);
      expect(getMockStatement().bind).toHaveBeenCalledWith(7, 50);
    });

    it("should use defaults when not specified", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });
      await getRecentDeals(mockDb as unknown as D1Database);
      expect(getMockStatement().bind).toHaveBeenCalledWith(7, 50);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));
      const results = await getRecentDeals(mockDb as unknown as D1Database);
      expect(results).toEqual([]);
    });
  });
});
