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

  describe("getTopDomains", () => {
    it("should return top domains with deal and referral counts", async () => {
      const mockDomains = [
        { domain: "example.com", deals: 10, referrals: 25 },
        { domain: "test.com", deals: 8, referrals: 15 },
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockDomains,
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });

      const results = await getTopDomains(mockDb as unknown as D1Database, 10);

      expect(results).toHaveLength(2);
      expect(results[0]!.domain).toBe("example.com");
      expect(results[0]!.deals).toBe(10);
      expect(results[0]!.referrals).toBe(25);
    });

    it("should respect limit parameter", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      await getTopDomains(mockDb as unknown as D1Database, 5);

      expect(getMockStatement().bind).toHaveBeenCalledWith(5);
    });

    it("should default to 10 domains", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      await getTopDomains(mockDb as unknown as D1Database);

      expect(getMockStatement().bind).toHaveBeenCalledWith(10);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));

      const results = await getTopDomains(mockDb as unknown as D1Database);

      expect(results).toEqual([]);
    });
  });

  describe("getReferralUsageStats", () => {
    it("should return comprehensive usage statistics", async () => {
      getMockStatement()
        .first.mockResolvedValueOnce({ count: 150 }) // totalUses
        .mockResolvedValueOnce({ count: 45 }); // uniqueUsers

      getMockStatement().run.mockResolvedValue({
        results: [
          { date: "2024-01-01", count: 5 },
          { date: "2024-01-02", count: 10 },
        ],
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });

      const stats = await getReferralUsageStats(
        mockDb as unknown as D1Database,
        30,
      );

      expect(stats.totalUses).toBe(150);
      expect(stats.uniqueUsers).toBe(45);
      expect(stats.byDay).toHaveLength(2);
    });

    it("should handle missing data gracefully", async () => {
      getMockStatement()
        .first.mockResolvedValueOnce(null) // totalUses
        .mockResolvedValueOnce(null); // uniqueUsers

      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      const stats = await getReferralUsageStats(
        mockDb as unknown as D1Database,
      );

      expect(stats.totalUses).toBe(0);
      expect(stats.uniqueUsers).toBe(0);
      expect(stats.byDay).toEqual([]);
    });

    it("should default to 30 days", async () => {
      getMockStatement()
        .first.mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      await getReferralUsageStats(mockDb as unknown as D1Database);

      const firstCall = getMockStatement().bind.mock.calls[0];
      expect(firstCall).toContain(30);
    });

    it("should return zeros on error", async () => {
      getMockStatement().first.mockRejectedValue(new Error("Database error"));

      const stats = await getReferralUsageStats(
        mockDb as unknown as D1Database,
      );

      expect(stats.totalUses).toBe(0);
      expect(stats.uniqueUsers).toBe(0);
      expect(stats.byDay).toEqual([]);
    });
  });
});
