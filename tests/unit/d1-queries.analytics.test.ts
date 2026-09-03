/**
 * Unit Tests for D1 Queries — Analytics
 * getTopDomains, getReferralUsageStats
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  getTopDomains,
  getReferralUsageStats,
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

// ============================================================================
// Test Suite
// ============================================================================

describe("D1 Queries — Analytics", () => {
  let mockDb: ReturnType<typeof createMockD1>;
  const getMockStatement = () => currentMockStatement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockD1();
  });

  // ========================================================================
  // getTopDomains
  // ========================================================================

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

  // ========================================================================
  // getReferralUsageStats
  // ========================================================================

  describe("getReferralUsageStats", () => {
    it("should return comprehensive usage statistics", async () => {
      getMockStatement()
        .first.mockResolvedValueOnce({ count: 150 })
        .mockResolvedValueOnce({ count: 45 });

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
        .first.mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

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
