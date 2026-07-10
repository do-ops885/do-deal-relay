/**
 * Unit Tests for D1 Queries — Mutations
 * insertDeal, insertReferralCode, getReferralCodesByDeal, getReferralCodeByString
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";
import type { Deal, ReferralInput } from "../../worker/types";
import {
  insertDeal,
  insertReferralCode,
  getReferralCodesByDeal,
  getReferralCodeByString,
  type DealSearchResult,
  type DealStats,
  type ExpiringDealRow,
  type ReferralCodeResult,
} from "../../worker/lib/d1/queries";

// ============================================================================
// Mock Factory
// ============================================================================

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

describe("D1 Queries — Mutations", () => {
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

  // ========================================================================
  // insertDeal
  // ========================================================================

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

  // ========================================================================
  // insertReferralCode
  // ========================================================================

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

  // ========================================================================
  // getReferralCodesByDeal
  // ========================================================================

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

  // ========================================================================
  // getReferralCodeByString
  // ========================================================================

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
});
