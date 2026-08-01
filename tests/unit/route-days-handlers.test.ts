import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../worker/types";

const {
  mockGenerateDealAnalytics,
  mockGenerateAnalyticsSummary,
  mockGetTrendingDealsD1,
} = vi.hoisted(() => ({
  mockGenerateDealAnalytics: vi.fn(),
  mockGenerateAnalyticsSummary: vi.fn(),
  mockGetTrendingDealsD1: vi.fn(),
}));

vi.mock("../../worker/lib/analytics", () => ({
  generateDealAnalytics: mockGenerateDealAnalytics,
  generateAnalyticsSummary: mockGenerateAnalyticsSummary,
}));

vi.mock("../../worker/lib/d1/queries", () => ({
  getDealsByDomain: vi.fn(),
  getDealsByCategory: vi.fn(),
  getActiveDeals: vi.fn(),
  getExpiringDeals: vi.fn(),
  getSimilarDealsD1: vi.fn(),
  getRecommendedDealsD1: vi.fn(),
  getTrendingDealsD1: mockGetTrendingDealsD1,
}));

import { handleAnalytics } from "../../worker/routes/core/analytics";
import { handleD1Trending } from "../../worker/routes/d1/deals";

function createMockEnv(): Env {
  return {
    DEALS_DB: {} as D1Database,
  } as Env;
}

const ANALYTICS_RESULT = { deals_over_time: [], total_deals: 0 };
const SUMMARY_RESULT = { total_deals: 0, active_deals: 0 };
const TRENDING_RESULT = [{ id: "deal-1", score: 0.9 }];

describe("handler days parsing", () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
    mockGenerateDealAnalytics.mockReset();
    mockGenerateAnalyticsSummary.mockReset();
    mockGetTrendingDealsD1.mockReset();
    mockGenerateDealAnalytics.mockResolvedValue(ANALYTICS_RESULT);
    mockGenerateAnalyticsSummary.mockResolvedValue(SUMMARY_RESULT);
    mockGetTrendingDealsD1.mockResolvedValue(TRENDING_RESULT);
  });

  describe("handleAnalytics", () => {
    it("passes the default 30-day window to the normal analytics handler", async () => {
      const response = await handleAnalytics(
        new URL("https://example.com/api/analytics"),
        env,
      );

      expect(response.status).toBe(200);
      expect(mockGenerateDealAnalytics).toHaveBeenCalledWith(env, 30);
      expect(await response.json()).toEqual(ANALYTICS_RESULT);
    });

    it.each([
      ["valid", "14", 14],
      ["invalid", "abc", 1],
      ["below the minimum", "0", 1],
      ["above the maximum", "400", 365],
    ])(
      "passes the %s days value to normal analytics",
      async (_label, rawDays, expectedDays) => {
        await handleAnalytics(
          new URL(`https://example.com/api/analytics?days=${rawDays}`),
          env,
        );

        expect(mockGenerateDealAnalytics).toHaveBeenCalledWith(
          env,
          expectedDays,
        );
      },
    );

    it("uses the same parsed days value for summary format", async () => {
      const response = await handleAnalytics(
        new URL("https://example.com/api/analytics?format=summary&days=NaN"),
        env,
      );

      expect(response.status).toBe(200);
      expect(mockGenerateAnalyticsSummary).toHaveBeenCalledWith(env, 1);
      expect(mockGenerateDealAnalytics).not.toHaveBeenCalled();
      expect(await response.json()).toEqual(SUMMARY_RESULT);
    });
  });

  describe("handleD1Trending", () => {
    it("passes the route-specific default of 7 days and returns the period", async () => {
      const response = await handleD1Trending(
        new URL("https://example.com/api/d1/trending"),
        env,
      );

      expect(response.status).toBe(200);
      expect(mockGetTrendingDealsD1).toHaveBeenCalledWith(env.DEALS_DB, 7, 10);
      expect(await response.json()).toEqual({
        trending: TRENDING_RESULT,
        total: TRENDING_RESULT.length,
        period_days: 7,
      });
    });

    it.each([
      ["valid", "21", 21],
      ["invalid", "abc", 1],
      ["below the minimum", "-5", 1],
    ])(
      "passes the %s days value to the D1 trending query",
      async (_label, rawDays, expectedDays) => {
        await handleD1Trending(
          new URL(`https://example.com/api/d1/trending?days=${rawDays}`),
          env,
        );

        expect(mockGetTrendingDealsD1).toHaveBeenCalledWith(
          env.DEALS_DB,
          expectedDays,
          10,
        );
      },
    );

    it("preserves the explicit limit while parsing days", async () => {
      const response = await handleD1Trending(
        new URL("https://example.com/api/d1/trending?days=30&limit=25"),
        env,
      );

      expect(mockGetTrendingDealsD1).toHaveBeenCalledWith(env.DEALS_DB, 30, 25);
      const body = (await response.json()) as { period_days: number };
      expect(body.period_days).toBe(30);
    });
  });
});
