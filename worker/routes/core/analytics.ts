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
} from "../../lib/analytics";

/**
 * Handle analytics dashboard endpoint - GET /api/analytics
 */
export async function handleAnalytics(url: URL, env: Env): Promise<Response> {
  const format = url.searchParams.get("format") || "json";
  const days = url.searchParams.has("days")
    ? parseInt(url.searchParams.get("days")!, 10)
    : 30;

  try {
    if (format === "summary") {
      const summary = await generateAnalyticsSummary(env, days);
      return jsonResponse(summary);
    }

    const analytics = await generateDealAnalytics(env, days);
    return jsonResponse(analytics);
  } catch (error) {
    console.error("Analytics generation error:", error);
    return jsonResponse(
      {
        error: "Failed to generate analytics",
        message: (error as Error).message,
      },
      500,
    );
  }
}
