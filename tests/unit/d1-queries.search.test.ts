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

      await searchDeals(mockDb as unknown as D1Database, "test", {
        limit: 5,
      });

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

  // ============================================================================
  // Domain and Category Tests
  // ============================================================================

