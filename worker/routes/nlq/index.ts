/**
 * NLQ (Natural Language Query) Route Handler
 *
 * Provides an endpoint to query deals using natural language.
 * Parses user queries, classifies intent, and executes structured
 * database queries with full-text search.
 *
 * Endpoint: POST /api/nlq
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { type NLQError } from "../../lib/nlq/types";
import {
  handleNLQ,
  handleNLQGet,
  handleNLQExplain,
  executeNLQ,
  parseNaturalLanguageQuery,
} from "./handlers";

export { executeNLQ, parseNaturalLanguageQuery } from "./handlers";

/**
 * Main NLQ Request Router
 *
 * Routes all NLQ-related requests to the appropriate handler.
 *
 * @param request - HTTP request
 * @param url - Parsed URL
 * @param env - Worker environment
 * @returns Response
 */
export async function handleNLQRequest(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const path = url.pathname;

  // Explain endpoint
  if (path === "/api/nlq/explain") {
    return handleNLQExplain(request, env);
  }

  // Main NLQ endpoint
  if (path === "/api/nlq") {
    if (request.method === "POST") {
      return handleNLQ(request, env);
    }
    if (request.method === "GET") {
      return handleNLQGet(url, env);
    }
    return jsonResponse(
      {
        error: "Method not allowed",
        message: "Only GET and POST methods are supported",
        code: "METHOD_NOT_ALLOWED",
      } as NLQError,
      405,
    );
  }

  return jsonResponse(
    {
      error: "Not found",
      message: "NLQ endpoint not found",
      code: "NOT_FOUND",
    } as NLQError,
    404,
  );
}
