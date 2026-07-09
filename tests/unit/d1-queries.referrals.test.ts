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

  describe("getReferralCodesByDeal", () => {
    it("should return referral codes for a deal", async () => {
      const mockReferrals: ReferralCodeResult[] = [
        {
          id: 1,
          code: "REF001",
          deal_id: 1,
          deal_title: "Test Deal",
          domain: "test.com",
          status: "active",
          max_uses: 100,
          current_uses: 50,
          use_count: 50,
        },
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockReferrals,
        success: true,
        meta: { rows_read: 1, rows_written: 0 },
      });

      const results = await getReferralCodesByDeal(
        mockDb as unknown as D1Database,
        1,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.code).toBe("REF001");
      expect(getMockStatement().bind).toHaveBeenCalledWith(1);
    });

    it("should filter by active status by default", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      await getReferralCodesByDeal(mockDb as unknown as D1Database, 1);

      const prepareCall = getLastSessionQuery();
      expect(prepareCall).toContain(
        "rc.is_active = 1 AND rc.status = 'active'",
      );
    });

    it("should include inactive when activeOnly is false", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      await getReferralCodesByDeal(mockDb as unknown as D1Database, 1, false);

      const prepareCall = getLastSessionQuery();
      expect(prepareCall).not.toContain(
        "rc.is_active = 1 AND rc.status = 'active'",
      );
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));

      const results = await getReferralCodesByDeal(
        mockDb as unknown as D1Database,
        1,
      );

      expect(results).toEqual([]);
    });
  });

  describe("getReferralCodeByString", () => {
    it("should return referral code by code string", async () => {
      const mockReferral: ReferralCodeResult = {
        id: 1,
        code: "SPECIALCODE",
        deal_id: 1,
        deal_title: "Special Deal",
        domain: "special.com",
        status: "active",
        max_uses: 100,
        current_uses: 0,
        use_count: 0,
        expires_at: undefined,
        days_remaining: undefined,
      };
      getMockStatement().first.mockResolvedValue(mockReferral);

      const result = await getReferralCodeByString(
        mockDb as unknown as D1Database,
        "SPECIALCODE",
      );

      expect(result).not.toBeNull();
      expect(result?.code).toBe("SPECIALCODE");
      expect(getMockStatement().bind).toHaveBeenCalledWith("SPECIALCODE");
    });

    it("should be case-insensitive", async () => {
      getMockStatement().first.mockResolvedValue(null);

      await getReferralCodeByString(
        mockDb as unknown as D1Database,
        "lowercase",
      );

      const prepareCall = getLastSessionQuery();
      expect(prepareCall).toContain("COLLATE NOCASE");
    });

    it("should return null when code not found", async () => {
      getMockStatement().first.mockResolvedValue(null);

      const result = await getReferralCodeByString(
        mockDb as unknown as D1Database,
        "NONEXISTENT",
      );

      expect(result).toBeNull();
    });

    it("should return null on error", async () => {
      getMockStatement().first.mockRejectedValue(new Error("Database error"));

      const result = await getReferralCodeByString(
        mockDb as unknown as D1Database,
        "TEST",
      );

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // Analytics Query Tests
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

