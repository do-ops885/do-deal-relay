/**
 * NLQ Route Handlers
 *
 * HTTP handlers for NLQ endpoints (POST, GET, explain).
 */

import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../../lib/rate-limit";
import {
  NLQRequestSchema,
  type NLQRequest,
  type NLQResult,
  type NLQError,
  type NLQExplanation,
} from "../../lib/nlq/types";
import { parseQuery } from "../../lib/nlq/parser";
import {
  buildStructuredQuery,
  executeStructuredQuery,
  explainQuery,
} from "../../lib/nlq/query-builder";
import { generateTraceId, getNLQLogger, getRateLimitConfig } from "./utils";

// Re-export service functions for backwards compatibility
export { executeNLQ, parseNaturalLanguageQuery } from "./service";

/**
 * Handle natural language query requests.
 *
 * Parses user-provided natural language queries, extracts entities,
 * classifies intent, and executes database queries with structured
 * filtering and full-text search.
 *
 * @param request - HTTP request with JSON body
 * @param env - Worker environment
 * @returns JSON response with search results and explanation
 * @example
 * ```bash
 * curl -X POST /api/nlq \
 *   -H "Content-Type: application/json" \
 *   -d '{"query": "trading platforms with $100+ signup bonus"}'
 * ```
 */
export async function handleNLQ(request: Request, env: Env): Promise<Response> {
  const traceId = generateTraceId();
  const logger = getNLQLogger(env, traceId);

  // Check D1 availability
  if (!env.DEALS_DB) {
    logger.error("D1 database not configured");
    return jsonResponse(
      {
        error: "D1 database not configured",
        code: "DATABASE_UNAVAILABLE",
      } as NLQError,
      503,
    );
  }

  // Rate limiting
  const clientId = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    getRateLimitConfig().keyPrefix,
  );

  if (!rateLimitResult.allowed) {
    logger.warn("Rate limit exceeded", {
      client_id: clientId,
      trace_id: traceId,
    });

    const response = jsonResponse(
      {
        error: "Rate limit exceeded",
        message: "Too many requests. Please try again later.",
        code: "RATE_LIMITED",
        retry_after: rateLimitResult.resetTime - Math.floor(Date.now() / 1000),
      } as NLQError,
      429,
    );

    // Add rate limit headers
    const headers = createRateLimitHeaders(rateLimitResult);
    headers.forEach((value, key) => response.headers.set(key, value));

    return response;
  }

  // Validate request method
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed",
        message: "Only POST requests are supported",
        code: "METHOD_NOT_ALLOWED",
      } as NLQError,
      405,
    );
  }

  // Parse and validate request body
  let body: NLQRequest;
  try {
    const rawBody = (await request.json()) as Record<string, unknown>;
    const validation = NLQRequestSchema.safeParse(rawBody);

    if (!validation.success) {
      logger.warn("Invalid request body", {
        errors: validation.error.errors,
        trace_id: traceId,
      });

      return jsonResponse(
        {
          error: "Invalid request body",
          message: "Query validation failed",
          code: "VALIDATION_ERROR",
          details: {
            errors: validation.error.errors,
          },
        } as NLQError,
        400,
      );
    }

    body = validation.data;
  } catch (error) {
    logger.error(
      "Failed to parse request body",
      error instanceof Error ? error : undefined,
    );
    return jsonResponse(
      {
        error: "Invalid JSON",
        message: "Request body must be valid JSON",
        code: "PARSE_ERROR",
      } as NLQError,
      400,
    );
  }

  // Log the query
  logger.info("Processing NLQ request", {
    query: body.query,
    limit: body.limit,
    trace_id: traceId,
    client_id: clientId,
  });

  // Execute the query
  const startTime = Date.now();

  try {
    // Step 1: Parse the natural language query
    const parsed = parseQuery(body.query);

    logger.debug("Query parsed", {
      intent: parsed.intent.intent,
      confidence: parsed.intent.confidence,
      entities: parsed.entities.length,
      trace_id: traceId,
    });

    // Step 2: Build structured query
    const structured = buildStructuredQuery(parsed, undefined, {
      limit: body.limit,
      offset: body.offset,
      includeExpired: body.include_expired,
      minConfidence: body.min_confidence,
    });

    // Step 3: Execute the query
    const results = await executeStructuredQuery(env.DEALS_DB, structured);

    const executionTime = Date.now() - startTime;

    // Step 4: Build response with explanation
    const explanation = explainQuery(parsed, structured) as NLQExplanation;

    logger.info("Query executed successfully", {
      result_count: results.length,
      execution_time_ms: executionTime,
      trace_id: traceId,
    });

    const responseData: NLQResult = {
      success: true,
      query: body.query,
      explanation,
      count: results.length,
      execution_time_ms: executionTime,
      results,
    };

    const response = jsonResponse(responseData, 200);

    // Add rate limit headers to successful response
    const headers = createRateLimitHeaders(rateLimitResult);
    headers.forEach((value, key) => response.headers.set(key, value));

    return response;
  } catch (error) {
    const executionTime = Date.now() - startTime;

    logger.error(
      "Query execution failed",
      error instanceof Error ? error : new Error(String(error)),
      {
        query: body.query,
        execution_time_ms: executionTime,
        trace_id: traceId,
      },
    );

    return jsonResponse(
      {
        error: "Query execution failed",
        message: error instanceof Error ? error.message : String(error),
        code: "EXECUTION_ERROR",
        details: {
          query: body.query,
          execution_time_ms: executionTime,
        },
      } as NLQError,
      500,
    );
  }
}

/**
 * Handle GET requests for simple NLQ via URL parameter.
 *
 * Allows quick testing and simple queries via GET /api/nlq?q=...
 *
 * @param url - Request URL with query parameters
 * @param env - Worker environment
 * @returns JSON response with search results
 * @example
 * ```bash
 * curl "/api/nlq?q=trading%20platforms%20with%20bonus"
 * ```
 */
export async function handleNLQGet(url: URL, env: Env): Promise<Response> {
  const traceId = generateTraceId();
  const logger = getNLQLogger(env, traceId);

  // Check D1 availability
  if (!env.DEALS_DB) {
    return jsonResponse(
      {
        error: "D1 database not configured",
        code: "DATABASE_UNAVAILABLE",
      } as NLQError,
      503,
    );
  }

  const query = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const includeExpired = url.searchParams.get("include_expired") === "true";

  if (!query) {
    return jsonResponse(
      {
        error: "Missing query parameter",
        message: "Query parameter 'q' is required",
        code: "MISSING_PARAMETER",
      } as NLQError,
      400,
    );
  }

  // Validate query length
  if (query.length > 500) {
    return jsonResponse(
      {
        error: "Query too long",
        message: "Query must be 500 characters or less",
        code: "QUERY_TOO_LONG",
      } as NLQError,
      400,
    );
  }

  const startTime = Date.now();

  try {
    // Parse and execute
    const parsed = parseQuery(query);
    const structured = buildStructuredQuery(parsed, undefined, {
      limit,
      includeExpired,
    });
    const results = await executeStructuredQuery(env.DEALS_DB, structured);

    const executionTime = Date.now() - startTime;

    return jsonResponse(
      {
        success: true,
        query,
        explanation: explainQuery(parsed, structured),
        count: results.length,
        execution_time_ms: executionTime,
        results,
      } as NLQResult,
      200,
    );
  } catch (error) {
    logger.error(
      "GET query execution failed",
      error instanceof Error ? error : new Error(String(error)),
    );

    return jsonResponse(
      {
        error: "Query execution failed",
        message: error instanceof Error ? error.message : String(error),
        code: "EXECUTION_ERROR",
      } as NLQError,
      500,
    );
  }
}

/**
 * Handle explain requests to show how queries are parsed.
 *
 * Returns the parsed intent and entities without executing the query.
 *
 * @param request - HTTP request with JSON body
 * @param env - Worker environment
 * @returns JSON response with query explanation
 */
export async function handleNLQExplain(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse(
      {
        error: "D1 database not configured",
        code: "DATABASE_UNAVAILABLE",
      } as NLQError,
      503,
    );
  }

  let query: string;

  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { query?: string };
      query = body.query || "";
    } catch {
      return jsonResponse(
        {
          error: "Invalid JSON",
          code: "PARSE_ERROR",
        } as NLQError,
        400,
      );
    }
  } else {
    const url = new URL(request.url);
    query = url.searchParams.get("q") || "";
  }

  if (!query) {
    return jsonResponse(
      {
        error: "Missing query",
        message: "Query is required",
        code: "MISSING_PARAMETER",
      } as NLQError,
      400,
    );
  }

  try {
    const parsed = parseQuery(query);
    const structured = buildStructuredQuery(parsed);

    return jsonResponse(
      {
        success: true,
        query,
        parsed: {
          tokens: parsed.tokens.map((t) => ({
            value: t.value,
            type: t.type,
            normalized: t.normalized,
          })),
          intent: parsed.intent,
          entities: parsed.entities,
        },
        structured,
        explanation: explainQuery(parsed, structured),
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        error: "Explain failed",
        message: error instanceof Error ? error.message : String(error),
        code: "EXPLAIN_ERROR",
      } as NLQError,
      500,
    );
  }
}
