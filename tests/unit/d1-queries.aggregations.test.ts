/**
 * Comprehensive Unit Tests for D1 Queries
 * Tests all query functions with mocked D1Database
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";
import type { Deal, ReferralInput } from "../../worker/types";
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
  getDealStats,
  getDealTimeSeries,
  insertDeal,
  insertReferralCode,
  getReferralCodesByDeal,
  getReferralCodeByString,
  getTopDomains,
  getReferralUsageStats,
  type DealSearchResult,
  type DealStats,
  type ExpiringDealRow,
  type ReferralCodeResult,
} from "../../worker/lib/d1/queries";

// ============================================================================
// Mock Factory
// ============================================================================

// Create the statement mock factory
const createMockStatement = () => ({
  bind: vi.fn().mockReturnThis(),
  all: vi.fn().mockResolvedValue({ results: [], meta: {} }),
  first: vi.fn().mockResolvedValue(null),
  run: vi.fn().mockResolvedValue({ results: [], meta: {} }),
});

// Global statement reference that gets reset in beforeEach
let currentMockStatement = createMockStatement();
let currentMockSession: ReturnType<typeof createMockSession> | null = null;

const createMockSession = () => {
  const session = {
    prepare: vi.fn().mockImplementation(() => currentMockStatement),
    getBookmark: vi.fn().mockReturnValue("test-bookmark"),
  };
  return session;
};

const createMockD1 = () => {
  // Reset the current statement and session
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

const createMockDealInput = (): Partial<Deal> & {
  deal_id: string;
  title: string;
  url: string;
  domain: string;
} => ({
  deal_id: "deal-002",
  title: "New Test Deal",
  description: "New deal description",
  url: "https://newexample.com/deal",
  domain: "newexample.com",
  code: "NEWCODE",
  source: {
    url: "https://source.com",
    domain: "source.com",
    discovered_at: new Date().toISOString(),
    trust_score: 0.8,
  },
  reward: {
    type: "credit",
    value: 100,
    currency: "USD",
    description: "$100 credit",
  },
  metadata: {
    category: ["finance"],
    tags: ["credit", "bonus"],
    normalized_at: new Date().toISOString(),
    confidence_score: 0.9,
    status: "active",
  },
  expiry: {
    date: new Date(Date.now() + 86400000).toISOString(),
    confidence: 0.8,
    type: "soft",
  },
  requirements: ["new user"],
});

const createMockReferralInput = (): ReferralInput & { deal_id: number } => ({
  deal_id: 1,
  url: "https://referral.com/code",
  code: "REFCODE123",
  domain: "referral.com",
  description: "Referral code description",
  source: "user_submitted",
  status: "active",
  submitted_at: new Date().toISOString(),
  submitted_by: "user123",
  metadata: {
    title: "Referral Bonus",
    reward_type: "cash",
    reward_value: 25,
    category: ["referral"],
    tags: ["signup"],
  },
});

// ============================================================================
// Test Suite
// ============================================================================

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
      expect(bindCalls).toContain(1); // is_active = 1
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
      expect(bindCalls).toContain(0); // is_active = 0
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

  // ============================================================================
  // Status-Based Query Tests
  // ============================================================================

