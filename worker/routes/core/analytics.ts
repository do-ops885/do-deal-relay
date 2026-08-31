/**
 * Core API Routes - Analytics
 *
 * Handles GET /api/analytics
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import {
  generateDealAnalytics,
  generateAnalyticsSummary,
  generateReferralAnalytics,
} from "../../lib/analytics";
import { toError } from "../../lib/sanitize-error";
import { logger } from "../../lib/global-logger";

/**
 * Handle analytics dashboard endpoint - GET /api/analytics
 * Supports referral-specific sub-route and query params:
 * - GET /api/analytics/referrals?days=30
 * - GET /api/analytics?type=referrals  (alias: view=referrals, detail=referrals, metrics=referrals)
 */
export async function handleAnalytics(
  url: URL,
  env: Env,
  request?: Request,
): Promise<Response> {
  const format = url.searchParams.get("format") || "json";
  const daysParam = url.searchParams.get("days");
  const days = daysParam !== null ? parseInt(daysParam, 10) : 30;

  const isReferralRoute =
    url.pathname.endsWith("/referrals") ||
    url.pathname.endsWith("/referral") ||
    ["referrals", "referral", "referral-analytics"].includes(
      (url.searchParams.get("type") || "").toLowerCase(),
    ) ||
    ["referrals", "referral"].includes(
      (url.searchParams.get("view") || "").toLowerCase(),
    ) ||
    url.searchParams.get("detail") === "referrals" ||
    url.searchParams.get("metrics") === "referrals";

  if (isReferralRoute) {
    return handleReferralAnalytics(url, env, request, days);
  }

  try {
    if (format === "summary") {
      const summary = await generateAnalyticsSummary(env, days);
      return jsonResponse(summary, 200, request, env);
    }

    const analytics = await generateDealAnalytics(env, days);
    return jsonResponse(analytics, 200, request, env);
  } catch (error) {
    const err = toError(error);
    logger.error("Analytics generation error", {
      component: "analytics",
      error_message: err.message,
    });
    return jsonResponse(
      { error: "Failed to generate analytics" },
      500,
      request,
      env,
    );
  }
}

async function handleReferralAnalytics(
  url: URL,
  env: Env,
  request: Request | undefined,
  defaultDays: number,
): Promise<Response> {
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : defaultDays;
  const safeDays = Number.isFinite(days) && days > 0 && days <= 365 ? days : 30;
  const domainFilter = url.searchParams.get("domain") || undefined;
  const sourceFilter = url.searchParams.get("source") || undefined;

  try {
    const analytics = await generateReferralAnalytics(env, safeDays);

    let filtered = analytics;
    if (domainFilter || sourceFilter) {
      const filterVal = (domainFilter || sourceFilter || "").toLowerCase();
      filtered = {
        ...analytics,
        perSourceSuccessRate: analytics.perSourceSuccessRate.filter((r) =>
          r.domain.toLowerCase().includes(filterVal),
        ),
        conversionByDomain: analytics.conversionByDomain.filter((r) =>
          r.domain.toLowerCase().includes(filterVal),
        ),
      };
    }

    const includeParam = url.searchParams.get("include");
    if (includeParam) {
      const includes = includeParam
        .split(",")
        .map((s) => s.trim().toLowerCase());
      const out: Record<string, unknown> = {
        periodDays: filtered.periodDays,
        generatedAt: filtered.generatedAt,
      };
      if (
        includes.includes("source") ||
        includes.includes("per_source") ||
        includes.includes("success_rate")
      )
        out.perSourceSuccessRate = filtered.perSourceSuccessRate;
      if (
        includes.includes("reward") ||
        includes.includes("rewards") ||
        includes.includes("reward_totals")
      )
        out.rewardTotals = filtered.rewardTotals;
      if (includes.includes("conversion") || includes.includes("domain"))
        out.conversionByDomain = filtered.conversionByDomain;
      if (includes.includes("expiry") || includes.includes("time_to_expiry"))
        out.timeToExpiry = filtered.timeToExpiry;
      if (includes.includes("metrics") || includes.includes("system_metrics"))
        out.systemMetrics = filtered.systemMetrics;
      if (Object.keys(out).length === 2)
        return jsonResponse(filtered, 200, request, env);
      return jsonResponse(out, 200, request, env);
    }

    return jsonResponse(filtered, 200, request, env);
  } catch (error) {
    const err = toError(error);
    logger.error("Referral analytics generation error", {
      component: "analytics",
      error_message: err.message,
    });
    return jsonResponse(
      { error: "Failed to generate referral analytics" },
      500,
      request,
      env,
    );
  }
}
