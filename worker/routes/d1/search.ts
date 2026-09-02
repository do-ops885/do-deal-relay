/**
 * D1 Database API Routes - Search Endpoints
 *
 * Handles /api/d1/search and /api/d1/suggestions
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { getD1Logger, requireD1Db } from "./helpers";
import { searchDeals, getSearchSuggestions } from "../../lib/d1/queries";

// ============================================================================
// Search Endpoint - GET /api/d1/search
// ============================================================================

export async function handleD1Search(url: URL, env: Env): Promise<Response> {
  const dbGuard = requireD1Db(env);
  if (dbGuard) return dbGuard;

  const query = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const includeExpired = url.searchParams.get("include_expired") === "true";
  const status = url.searchParams.get("status") || undefined;

  if (!query) {
    return jsonResponse(
      { error: "Query parameter 'q' is required" },
      400,
      undefined,
      env,
    );
  }

  try {
    const results = await searchDeals(env.DEALS_DB, query, {
      limit,
      includeExpired,
      status,
    });

    return jsonResponse({
      success: true,
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 search error",
      error instanceof Error ? error : new Error(String(error)),
      { query },
    );
    return jsonResponse({ error: "Search failed" }, 500, undefined, env);
  }
}

// ============================================================================
// Search Suggestions Endpoint - GET /api/d1/suggestions
// ============================================================================

export async function handleD1Suggestions(
  url: URL,
  env: Env,
): Promise<Response> {
  const dbGuard = requireD1Db(env);
  if (dbGuard) return dbGuard;

  const partial = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  if (!partial || partial.length < 2) {
    return jsonResponse(
      { error: "Query parameter 'q' with at least 2 characters is required" },
      400,
    );
  }

  try {
    const suggestions = await getSearchSuggestions(
      env.DEALS_DB,
      partial,
      limit,
    );

    return jsonResponse({
      success: true,
      query: partial,
      suggestions,
    });
  } catch (error) {
    const logger = getD1Logger(env);
    logger.error(
      "D1 suggestions error",
      error instanceof Error ? error : new Error(String(error)),
      {
        partial,
      },
    );
    return jsonResponse(
      {
        error: "Suggestions failed",
      },
      500,
    );
  }
}
