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

  // ============================================================================
  // Statistics Query Tests
  // ============================================================================

