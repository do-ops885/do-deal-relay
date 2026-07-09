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

  // ============================================================================

  describe("insertDeal", () => {
    it("should insert a new deal successfully", async () => {
      getMockStatement().run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 123, changes: 1 },
      });

      const deal = createMockDealInput();
      const result = await insertDeal(mockDb as unknown as D1Database, deal);

      expect(result.success).toBe(true);
      expect(result.id).toBe(123);
    });

    it("should handle missing optional fields gracefully", async () => {
      getMockStatement().run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 456, changes: 1 },
      });

      const minimalDeal = {
        deal_id: "deal-minimal",
        title: "Minimal Deal",
        url: "https://minimal.com",
        domain: "minimal.com",
      };

      const result = await insertDeal(
        mockDb as unknown as D1Database,
        minimalDeal,
      );

      expect(result.success).toBe(true);
    });

    it("should return error on insert failure", async () => {
      // D1Client returns error when run() throws
      getMockStatement().run.mockRejectedValue(new Error("Duplicate deal_id"));

      const deal = createMockDealInput();
      const result = await insertDeal(mockDb as unknown as D1Database, deal);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Duplicate deal_id");
    });

    it("should handle database errors", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Connection lost"));

      const deal = createMockDealInput();
      const result = await insertDeal(mockDb as unknown as D1Database, deal);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should use default values for missing reward data", async () => {
      getMockStatement().run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 789, changes: 1 },
      });

      const dealWithoutReward = {
        deal_id: "deal-no-reward",
        title: "No Reward Deal",
        url: "https://noreward.com",
        domain: "noreward.com",
      };

      const result = await insertDeal(
        mockDb as unknown as D1Database,
        dealWithoutReward,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("insertReferralCode", () => {
    it("should insert a referral code successfully", async () => {
      getMockStatement().run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 100, changes: 1 },
      });

      const referral = createMockReferralInput();
      const result = await insertReferralCode(
        mockDb as unknown as D1Database,
        referral,
      );

      expect(result.success).toBe(true);
      expect(result.id).toBe(100);
    });

    it("should handle referral without metadata", async () => {
      getMockStatement().run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 101, changes: 1 },
      });

      const minimalReferral = {
        deal_id: 1,
        url: "https://test.com",
        code: "MINIMAL",
      };

      const result = await insertReferralCode(
        mockDb as unknown as D1Database,
        minimalReferral as ReferralInput & { deal_id: number },
      );

      expect(result.success).toBe(true);
    });

    it("should return error on insert failure", async () => {
      // D1Client returns error when run() throws
      getMockStatement().run.mockRejectedValue(
        new Error("Code already exists"),
      );

      const referral = createMockReferralInput();
      const result = await insertReferralCode(
        mockDb as unknown as D1Database,
        referral,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Code already exists");
    });

    it("should handle database errors", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database timeout"));

      const referral = createMockReferralInput();
      const result = await insertReferralCode(
        mockDb as unknown as D1Database,
        referral,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // Referral Code Query Tests
  // ============================================================================

