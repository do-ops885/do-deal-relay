/**
 * Unit Tests for D1 Queries — Statistics
 * getDealStats, getDealTimeSeries
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";
import type { Deal, ReferralInput } from "../../worker/types";
import {
  getDealStats,
  getDealTimeSeries,
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

// ============================================================================
// Test Suite
// ============================================================================

describe("D1 Queries — Statistics", () => {
  let mockDb: ReturnType<typeof createMockD1>;
  const getMockStatement = () => currentMockStatement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockD1();
  });

  // ========================================================================
  // getDealStats
  // ========================================================================

  describe("getDealStats", () => {
    it("should return comprehensive deal statistics", async () => {
      getMockStatement()
        .run.mockResolvedValueOnce({
          results: [
            {
              total: 100,
              active: 80,
              quarantined: 10,
              rejected: 5,
              expired: 5,
            },
          ],
          success: true,
          meta: { rows_read: 1, rows_written: 0 },
        })
        .mockResolvedValueOnce({
          results: [
            { domain: "example.com", count: 20 },
            { domain: "test.com", count: 15 },
          ],
          success: true,
          meta: { rows_read: 2, rows_written: 0 },
        })
        .mockResolvedValueOnce({
          results: [
            { type: "cash", count: 40 },
            { type: "credit", count: 30 },
          ],
          success: true,
          meta: { rows_read: 2, rows_written: 0 },
        })
        .mockResolvedValueOnce({
          results: [{ categories: '["finance"]' }],
          success: true,
          meta: { rows_read: 1, rows_written: 0 },
        });

      const stats = await getDealStats(mockDb as unknown as D1Database);

      expect(stats.total).toBe(100);
      expect(stats.active).toBe(80);
      expect(stats.quarantined).toBe(10);
      expect(stats.rejected).toBe(5);
      expect(stats.expired).toBe(5);
      expect(stats.byDomain).toHaveLength(2);
      expect(stats.byRewardType).toHaveLength(2);
      expect(stats.byCategory).toHaveLength(1);
    });

    it("should handle zeros when no data", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      const stats = await getDealStats(mockDb as unknown as D1Database);

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.byDomain).toEqual([]);
      expect(stats.byCategory).toEqual([]);
      expect(stats.byRewardType).toEqual([]);
    });

    it("should return defaults on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));

      const stats = await getDealStats(mockDb as unknown as D1Database);

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.byDomain).toEqual([]);
    });
  });

  // ========================================================================
  // getDealTimeSeries
  // ========================================================================

  describe("getDealTimeSeries", () => {
    it("should return time-series data for specified days", async () => {
      const mockData = [
        { date: "2024-01-01", count: 10, new_count: 2 },
        { date: "2024-01-02", count: 12, new_count: 2 },
      ];
      getMockStatement().run.mockResolvedValue({
        results: mockData,
        success: true,
        meta: { rows_read: 2, rows_written: 0 },
      });

      const results = await getDealTimeSeries(
        mockDb as unknown as D1Database,
        30,
      );

      expect(results).toHaveLength(2);
      expect(results[0]!.date).toBe("2024-01-01");
      expect(results[0]!.count).toBe(10);
    });

    it("should default to 30 days", async () => {
      getMockStatement().run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      await getDealTimeSeries(mockDb as unknown as D1Database);

      expect(getMockStatement().bind).toHaveBeenCalledWith(30);
    });

    it("should return empty array on error", async () => {
      getMockStatement().run.mockRejectedValue(new Error("Database error"));

      const results = await getDealTimeSeries(mockDb as unknown as D1Database);

      expect(results).toEqual([]);
    });
  });
});
