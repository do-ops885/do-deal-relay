/**
 * Validation API Routes
 *
 * Provides HTTP endpoints for:
 * - URL validation
 * - Batch URL validation
 * - Deal validation
 * - Validation statistics
 *
 * Features:
 * - Rate limiting on all endpoints
 * - Circuit breaker protection
 * - EU AI Act compliant logging
 * - Proper error handling
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "./utils";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../lib/rate-limit";
import {
  validateUrl,
  checkUrlStatusBatch,
  detectRedirects,
  getValidationSummary,
} from "../lib/validation/url-validator";
import {
  validateCodeComplete,
  validateCodesBatch,
  getSupportedProviders,
} from "../lib/validation/code-validator";
import {
  scrapeCurrentRewards,
  batchScrapeRewards,
  getScrapingStats,
} from "../lib/validation/reward-scraper";
import {
  getDealsByCode,
  getActiveDeals,
  getProductionSnapshot,
} from "../lib/storage";
import {
  getValidationStats,
  getLastValidationResults,
} from "../lib/expiration";
import { logger } from "../lib/global-logger";
import { createComplianceLogger } from "../lib/eu-ai-act-logger";

// ============================================================================
// Types
// ============================================================================

interface ValidateUrlBody {
  url: string;
}

interface ValidateBatchBody {
  urls: string[];
  checkRewards?: boolean;
}

interface ValidateDealBody {
  checkUrl?: boolean;
  checkCode?: boolean;
  checkRewards?: boolean;
}

// ============================================================================
// EU AI Act Compliance
// ============================================================================

function logValidationOperation(
  env: Env,
  operation: string,
  input: unknown,
  output: unknown,
): void {
  try {
    if (env.DEALS_DB) {
      const complianceLogger = createComplianceLogger(env.DEALS_DB);
      complianceLogger.logOperation({
        timestamp: new Date().toISOString(),
        systemId: "do-deal-relay",
        operationId: crypto.randomUUID(),
        operation,
        operationVersion: "0.1.0",
        inputData: {
          source: "api",
          hash: "",
          description: `Validation API: ${operation}`,
          metadata: input as Record<string, unknown>,
        },
        outputData: {
          result: JSON.stringify(output),
        },
      });
    }
  } catch {
    // Silently fail logging - don't break API
  }
}

// ============================================================================
// URL Validation Endpoints
// ============================================================================

/**
 * POST /api/validate/url
 * Validate a single URL
 */
export async function handleValidateUrl(
  request: Request,
  env: Env,
): Promise<Response> {
  const clientId = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/validate/url",
  );

  if (!rateLimitResult.allowed) {
    return errorResponse("Rate limit exceeded", 429, {
      retry_after: rateLimitResult.resetTime,
    });
  }

  try {
    const body = (await request.json()) as ValidateUrlBody;

    if (!body.url || typeof body.url !== "string") {
      return errorResponse("URL is required", 400);
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return errorResponse("Invalid URL format", 400);
    }

    logger.info(`URL validation request`, {
      component: "validation-api",
      url: body.url,
      clientId: clientId.slice(0, 8),
    });

    // Perform validation
    const result = await validateUrl(body.url, env);

    // Log for compliance
    logValidationOperation(env, "validate_url", { url: body.url }, result);

    // Add rate limit headers
    const headers = createRateLimitHeaders(rateLimitResult);
    const response = jsonResponse(result, result.valid ? 200 : 400);
    headers.forEach((value, key) => response.headers.set(key, value));

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Validation failed";
    logger.error(`URL validation error`, {
      component: "validation-api",
      error: errorMessage,
    });
    return errorResponse("Validation failed", 500, { detail: errorMessage });
  }
}

/**
 * POST /api/validate/batch
 * Batch validate multiple URLs
 */
export async function handleValidateBatch(
  request: Request,
  env: Env,
): Promise<Response> {
  const clientId = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/validate/batch",
  );

  if (!rateLimitResult.allowed) {
    return errorResponse("Rate limit exceeded", 429, {
      retry_after: rateLimitResult.resetTime,
    });
  }

  try {
    const body = (await request.json()) as ValidateBatchBody;

    if (!body.urls || !Array.isArray(body.urls)) {
      return errorResponse("urls array is required", 400);
    }

    if (body.urls.length === 0) {
      return errorResponse("urls array cannot be empty", 400);
    }

    if (body.urls.length > 50) {
      return errorResponse("Maximum 50 URLs per batch", 400);
    }

    // Validate all URLs are strings
    for (const url of body.urls) {
      if (typeof url !== "string") {
        return errorResponse("All URLs must be strings", 400);
      }
      try {
        new URL(url);
      } catch {
        return errorResponse(`Invalid URL: ${url}`, 400);
      }
    }

    logger.info(`Batch validation request`, {
      component: "validation-api",
      count: body.urls.length,
      clientId: clientId.slice(0, 8),
    });

    // Perform batch validation
    const urlResults = await checkUrlStatusBatch(body.urls, env);

    // Optionally check rewards
    let rewardResults = null;
    if (body.checkRewards) {
      const snapshot = await getProductionSnapshot(env);
      if (snapshot) {
        const dealsToCheck = snapshot.deals.filter((d) =>
          body.urls.includes(d.url),
        );
        rewardResults = await batchScrapeRewards(dealsToCheck, env);
      }
    }

    const summary = getValidationSummary(urlResults.results);

    const result = {
      summary,
      urls: urlResults.results,
      rewards: rewardResults
        ? rewardResults.map((r) => ({
            url: r.url,
            rewardChanged: r.rewardChanged,
            currentReward: r.currentReward,
            previousReward: r.previousReward,
          }))
        : undefined,
      errors: urlResults.errors,
    };

    // Log for compliance
    logValidationOperation(
      env,
      "validate_batch",
      { count: body.urls.length },
      { summary },
    );

    // Add rate limit headers
    const headers = createRateLimitHeaders(rateLimitResult);
    const response = jsonResponse(
      result,
      urlResults.errors.length > 0 ? 207 : 200,
    );
    headers.forEach((value, key) => response.headers.set(key, value));

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Batch validation failed";
    logger.error(`Batch validation error`, {
      component: "validation-api",
      error: errorMessage,
    });
    return errorResponse("Batch validation failed", 500, {
      detail: errorMessage,
    });
  }
}

// ============================================================================
// Validation Statistics
// ============================================================================

/**
 * GET /api/validation/stats
 * Get validation statistics
 */
export async function handleGetValidationStats(env: Env): Promise<Response> {
  try {
    // Get URL validation stats
    const [validationStats, lastRun, activeDeals, snapshot] = await Promise.all(
      [
        getValidationStats(env),
        getLastValidationResults(env),
        getActiveDeals(env),
        getProductionSnapshot(env),
      ],
    );

    // Calculate deal stats
    const withExpiry = activeDeals.filter((d) => d.expiry.date).length;
    const expired = activeDeals.filter((d) => {
      if (!d.expiry.date) return false;
      return new Date(d.expiry.date) <= new Date();
    }).length;
    const expiring7Days = activeDeals.filter((d) => {
      if (!d.expiry.date) return false;
      const daysUntil = Math.ceil(
        (new Date(d.expiry.date).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
      return daysUntil > 0 && daysUntil <= 7;
    }).length;

    const stats = {
      validation: validationStats || {
        timestamp: null,
        total: 0,
        valid: 0,
        invalid: 0,
        errors: 0,
      },
      last_run: lastRun || null,
      deals: {
        total: snapshot?.stats.total || 0,
        active: activeDeals.length,
        with_expiry: withExpiry,
        expired: expired,
        expiring_7d: expiring7Days,
        no_expiry: activeDeals.length - withExpiry,
      },
      providers: {
        supported: getSupportedProviders(),
      },
      generated_at: new Date().toISOString(),
    };

    return jsonResponse(stats);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get stats";
    logger.error(`Get validation stats error`, {
      component: "validation-api",
      error: errorMessage,
    });
    return errorResponse("Failed to get validation stats", 500, {
      detail: errorMessage,
    });
  }
}

// ============================================================================
// Deal Validation
// ============================================================================

/**
 * POST /api/deals/{code}/validate
 * Validate a specific deal by code
 */
export async function handleValidateDeal(
  request: Request,
  code: string,
  env: Env,
): Promise<Response> {
  const clientId = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/deals/validate",
  );

  if (!rateLimitResult.allowed) {
    return errorResponse("Rate limit exceeded", 429, {
      retry_after: rateLimitResult.resetTime,
    });
  }

  try {
    // Get request options
    let options: ValidateDealBody = {};
    if (request.headers.get("content-type")?.includes("application/json")) {
      options = (await request.json()) as ValidateDealBody;
    }

    // Default to checking everything
    const checkUrl = options.checkUrl !== false;
    const checkCode = options.checkCode !== false;
    const checkRewards = options.checkRewards === true;

    logger.info(`Deal validation request: ${code}`, {
      component: "validation-api",
      code,
      checkUrl,
      checkCode,
      checkRewards,
    });

    // Find the deal
    const deals = await getDealsByCode(env, code);

    if (deals.length === 0) {
      return errorResponse("Deal not found", 404);
    }

    // Use first matching deal
    const deal = deals[0];

    // Perform validations
    const results: {
      deal: {
        id: string;
        code: string;
        domain: string;
        url: string;
        status: string;
      };
      url?: Awaited<ReturnType<typeof validateUrl>>;
      code?: Awaited<ReturnType<typeof validateCodeComplete>>;
      rewards?: Awaited<ReturnType<typeof scrapeCurrentRewards>>;
      valid: boolean;
      issues: string[];
    } = {
      deal: {
        id: deal.id,
        code: deal.code,
        domain: deal.source.domain,
        url: deal.url,
        status: deal.metadata.status,
      },
      valid: true,
      issues: [],
    };

    // Check URL
    if (checkUrl) {
      results.url = await validateUrl(deal.url, env);
      if (!results.url.valid) {
        results.valid = false;
        results.issues.push(`URL validation failed: ${results.url.error}`);
      }
    }

    // Check code
    if (checkCode) {
      results.code = await validateCodeComplete(
        deal.code,
        "auto",
        deal.url,
        env,
      );
      if (!results.code.valid) {
        results.valid = false;
        results.issues.push(
          `Code validation failed: ${results.code.errors.join(", ")}`,
        );
      }
    }

    // Check rewards
    if (checkRewards) {
      results.rewards = await scrapeCurrentRewards(deal.url, env);
      if (results.rewards.rewardChanged) {
        results.issues.push("Reward has changed since last update");
      }
    }

    // Log for compliance
    logValidationOperation(
      env,
      "validate_deal",
      { code, options },
      { valid: results.valid },
    );

    // Add rate limit headers
    const headers = createRateLimitHeaders(rateLimitResult);
    const response = jsonResponse(results, results.valid ? 200 : 400);
    headers.forEach((value, key) => response.headers.set(key, value));

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Deal validation failed";
    logger.error(`Deal validation error`, {
      component: "validation-api",
      code,
      error: errorMessage,
    });
    return errorResponse("Deal validation failed", 500, {
      detail: errorMessage,
    });
  }
}
