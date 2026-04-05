/**
 * D1 Database API Routes - Router
 *
 * Main request dispatcher for all D1 API endpoints.
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { authenticateD1Request } from "./admin";
import { handleD1Search, handleD1Suggestions } from "./search";
import {
  handleD1Deals,
  handleD1Similar,
  handleD1Recommended,
  handleD1Trending,
} from "./deals";
import { handleD1Stats, handleD1Domains, handleD1Categories } from "./stats";
import { handleD1Migrations, handleD1Health } from "./admin";

// ============================================================================
// Main Handler Router
// ============================================================================

export async function handleD1Request(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  // Authenticate request
  const authenticated = await authenticateD1Request(env, request);
  if (!authenticated) {
    return jsonResponse(
      { error: "Unauthorized. X-API-Key header required." },
      401,
    );
  }

  const path = url.pathname;

  // Search endpoints
  if (path === "/api/d1/search" && request.method === "GET") {
    return handleD1Search(url, env);
  }

  if (path === "/api/d1/suggestions" && request.method === "GET") {
    return handleD1Suggestions(url, env);
  }

  // Statistics
  if (path === "/api/d1/stats" && request.method === "GET") {
    return handleD1Stats(env);
  }

  // Filtering
  if (path === "/api/d1/deals" && request.method === "GET") {
    return handleD1Deals(url, env);
  }

  if (path === "/api/d1/domains" && request.method === "GET") {
    return handleD1Domains(env);
  }

  if (path === "/api/d1/categories" && request.method === "GET") {
    return handleD1Categories(env);
  }

  // Migrations
  if (path === "/api/d1/migrations") {
    return handleD1Migrations(url, env);
  }

  // Health
  if (path === "/api/d1/health" && request.method === "GET") {
    return handleD1Health(env);
  }

  // Recommendations
  if (path === "/api/d1/similar" && request.method === "GET") {
    return handleD1Similar(url, env);
  }

  if (path === "/api/d1/recommended" && request.method === "GET") {
    return handleD1Recommended(url, env);
  }

  if (path === "/api/d1/trending" && request.method === "GET") {
    return handleD1Trending(url, env);
  }

  return jsonResponse({ error: "D1 endpoint not found" }, 404);
}
