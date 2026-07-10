/**
 * Unit Tests for D1 Queries — Search & Listing (Part 2)
 * getDomainsWithCounts, getCategoriesWithCounts, getActiveDeals,
 * getExpiringDeals, getRecentDeals
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  getDomainsWithCounts,
  getCategoriesWithCounts,
  getActiveDeals,
  getExpiringDeals,
  getRecentDeals,
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

describe("D1 Queries — Counts & Active", () => {
  let mockDb: ReturnType<typeof createMockD1>;
  const getMockStatement = () => currentMockStatement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockD1();
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
        {
          id: 1,
          deal_id: "deal-001",
          title: "Active Deal",
          domain: "test.com",
          code: "ACTIVE",
          url: "https://test.com/deal",
          reward_type: "cash",
          reward_value: 10,
          reward_currency: "USD",
          status: "active",
          category: ["test"],
          tags: ["new"],
          confidence_score: 0.9,
        },
        {
          id: 2,
          deal_id: "deal-002",
          title: "Active Deal 2",
          domain: "test.com",
          code: "ACTIVE2",
          url: "https://test.com/deal2",
          reward_type: "cash",
          reward_value: 20,
          reward_currency: "USD",
          status: "active",
          category: ["test"],
          tags: ["new"],
          confidence_score: 0.9,
        },
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
        {
          id: 1,
          deal_id: "deal-001",
          title: "Recent Deal",
          domain: "test.com",
          code: "RECENT",
          url: "https://test.com/deal",
          reward_type: "cash",
          reward_value: 10,
          reward_currency: "USD",
          status: "active",
          category: ["test"],
          tags: ["new"],
          confidence_score: 0.9,
        },
        {
          id: 2,
          deal_id: "deal-002",
          title: "Recent Deal 2",
          domain: "test.com",
          code: "RECENT2",
          url: "https://test.com/deal2",
          reward_type: "cash",
          reward_value: 20,
          reward_currency: "USD",
          status: "active",
          category: ["test"],
          tags: ["new"],
          confidence_score: 0.9,
        },
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
