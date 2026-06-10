/**
 * URL Validator Module
 *
 * Validates deal URLs by checking their health status, detecting redirects,
 * and batch processing multiple URLs with circuit breaker protection.
 */

import { CircuitBreaker, getSourceCircuitBreaker } from "../circuit-breaker";
import type { Env } from "../../types";
import { logger } from "../global-logger";
import { CONFIG } from "../../config";
import {
  MAX_REDIRECTS,
  MAX_BATCH_SIZE,
  INVALID_STATUS_CODES,
  REDIRECT_STATUS_CODES,
  type UrlValidationResult,
  type BatchValidationResult,
} from "./url-validator-types";
export type {
  UrlValidationResult,
  BatchValidationResult,
} from "./url-validator-types";
import { respectRateLimit, extractDomain } from "./url-rate-limit";
import { tryHeadRequest, tryGetRequest, resolveUrl } from "./url-request";

// ============================================================================
// URL Validation
// ============================================================================

export async function validateUrl(
  url: string,
  env?: Env,
): Promise<UrlValidationResult> {
  const startTime = Date.now();
  const domain = extractDomain(url);

  logger.info(`Validating URL: ${url}`, {
    component: "url-validator",
    domain,
  });

  await respectRateLimit(domain);

  const breaker = env
    ? getSourceCircuitBreaker(domain, env)
    : new CircuitBreaker(`validate:${domain}`, {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenMaxCalls: 2,
      });

  try {
    const result = await breaker.execute(async () => {
      return await performUrlValidation(url);
    });

    const responseTime = Date.now() - startTime;

    logger.info(`URL validation completed: ${url}`, {
      component: "url-validator",
      valid: result.valid,
      statusCode: result.statusCode,
      responseTimeMs: responseTime,
    });

    return {
      ...result,
      responseTimeMs: responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.error(`URL validation failed: ${url}`, {
      component: "url-validator",
      error: errorMessage,
      responseTimeMs: responseTime,
    });

    return {
      url,
      valid: false,
      redirectCount: 0,
      redirectChain: [],
      finalUrl: url,
      responseTimeMs: responseTime,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };
  }
}

async function performUrlValidation(url: string): Promise<UrlValidationResult> {
  const redirectChain: string[] = [url];
  let currentUrl = url;
  let redirectCount = 0;
  let finalStatusCode: number | undefined;
  let finalStatusText: string | undefined;

  while (redirectCount <= MAX_REDIRECTS) {
    try {
      const headResult = await tryHeadRequest(currentUrl);

      if (headResult.success) {
        finalStatusCode = headResult.statusCode;
        finalStatusText = headResult.statusText;

        if (
          headResult.statusCode &&
          REDIRECT_STATUS_CODES.includes(headResult.statusCode) &&
          headResult.location
        ) {
          const nextUrl = resolveUrl(currentUrl, headResult.location);
          if (redirectChain.includes(nextUrl)) {
            return {
              url,
              valid: false,
              statusCode: headResult.statusCode,
              statusText: "Redirect loop detected",
              redirectCount,
              redirectChain,
              finalUrl: currentUrl,
              responseTimeMs: 0,
              error: "Redirect loop detected",
              timestamp: new Date().toISOString(),
            };
          }

          redirectChain.push(nextUrl);
          currentUrl = nextUrl;
          redirectCount++;
          continue;
        }

        if (
          headResult.statusCode &&
          INVALID_STATUS_CODES.includes(headResult.statusCode)
        ) {
          return {
            url,
            valid: false,
            statusCode: headResult.statusCode,
            statusText: headResult.statusText,
            redirectCount,
            redirectChain,
            finalUrl: currentUrl,
            responseTimeMs: 0,
            error: `HTTP ${headResult.statusCode}: ${headResult.statusText}`,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          url,
          valid: true,
          statusCode: headResult.statusCode,
          statusText: headResult.statusText,
          redirectCount,
          redirectChain,
          finalUrl: currentUrl,
          responseTimeMs: 0,
          timestamp: new Date().toISOString(),
        };
      }

      const getResult = await tryGetRequest(currentUrl);

      if (getResult.success) {
        finalStatusCode = getResult.statusCode;
        finalStatusText = getResult.statusText;

        if (
          getResult.statusCode &&
          INVALID_STATUS_CODES.includes(getResult.statusCode)
        ) {
          return {
            url,
            valid: false,
            statusCode: getResult.statusCode,
            statusText: getResult.statusText,
            redirectCount,
            redirectChain,
            finalUrl: currentUrl,
            responseTimeMs: 0,
            error: `HTTP ${getResult.statusCode}: ${getResult.statusText}`,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          url,
          valid: true,
          statusCode: getResult.statusCode,
          statusText: getResult.statusText,
          redirectCount,
          redirectChain,
          finalUrl: currentUrl,
          responseTimeMs: 0,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        url,
        valid: false,
        statusCode: getResult.statusCode,
        statusText: getResult.statusText,
        redirectCount,
        redirectChain,
        finalUrl: currentUrl,
        responseTimeMs: 0,
        error: getResult.error || "Request failed",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        url,
        valid: false,
        redirectCount,
        redirectChain,
        finalUrl: currentUrl,
        responseTimeMs: 0,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return {
    url,
    valid: false,
    statusCode: finalStatusCode,
    statusText: finalStatusText,
    redirectCount,
    redirectChain,
    finalUrl: currentUrl,
    responseTimeMs: 0,
    error: `Exceeded maximum redirects (${MAX_REDIRECTS})`,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Batch Validation
// ============================================================================

export async function checkUrlStatusBatch(
  urls: string[],
  env?: Env,
): Promise<BatchValidationResult> {
  const startTime = Date.now();

  logger.info(`Starting batch URL validation for ${urls.length} URLs`, {
    component: "url-validator",
    batchSize: urls.length,
  });

  const limitedUrls = urls.slice(0, MAX_BATCH_SIZE);

  const domainGroups = new Map<string, string[]>();
  for (const url of limitedUrls) {
    const domain = extractDomain(url);
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain)!.push(url);
  }

  const results: UrlValidationResult[] = [];
  const errors: string[] = [];

  for (const [domain, domainUrls] of domainGroups) {
    for (const url of domainUrls) {
      try {
        const result = await validateUrl(url, env);
        results.push(result);

        if (domainUrls.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to validate ${url}: ${errorMessage}`);

        results.push({
          url,
          valid: false,
          redirectCount: 0,
          redirectChain: [],
          finalUrl: url,
          responseTimeMs: 0,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  const totalTime = Date.now() - startTime;
  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.length - validCount;
  const redirectCount = results.filter((r) => r.redirectCount > 0).length;

  logger.info(`Batch URL validation completed`, {
    component: "url-validator",
    totalUrls: urls.length,
    validCount,
    invalidCount,
    redirectCount,
    totalTimeMs: totalTime,
  });

  return {
    results,
    validCount,
    invalidCount,
    redirectCount,
    totalTimeMs: totalTime,
    errors,
  };
}

// ============================================================================
// Redirect Detection
// ============================================================================

export async function detectRedirects(
  url: string,
): Promise<UrlValidationResult> {
  const startTime = Date.now();
  const redirectChain: string[] = [url];
  let currentUrl = url;
  let redirectCount = 0;

  logger.info(`Detecting redirects for: ${url}`, {
    component: "url-validator",
  });

  while (redirectCount <= MAX_REDIRECTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(currentUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const location = response.headers.get("location");
      if (location && REDIRECT_STATUS_CODES.includes(response.status)) {
        const nextUrl = resolveUrl(currentUrl, location);

        if (redirectChain.includes(nextUrl)) {
          const responseTime = Date.now() - startTime;
          return {
            url,
            valid: false,
            statusCode: response.status,
            statusText: "Redirect loop detected",
            redirectCount,
            redirectChain,
            finalUrl: currentUrl,
            responseTimeMs: responseTime,
            error: "Redirect loop detected",
            timestamp: new Date().toISOString(),
          };
        }

        redirectChain.push(nextUrl);
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      const responseTime = Date.now() - startTime;

      const isValid =
        response.status >= 200 &&
        response.status < 400 &&
        !INVALID_STATUS_CODES.includes(response.status);

      return {
        url,
        valid: isValid,
        statusCode: response.status,
        statusText: response.statusText,
        redirectCount,
        redirectChain,
        finalUrl: currentUrl,
        responseTimeMs: responseTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        url,
        valid: false,
        redirectCount,
        redirectChain,
        finalUrl: currentUrl,
        responseTimeMs: responseTime,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  const responseTime = Date.now() - startTime;
  return {
    url,
    valid: false,
    redirectCount,
    redirectChain,
    finalUrl: currentUrl,
    responseTimeMs: responseTime,
    error: `Exceeded maximum redirects (${MAX_REDIRECTS})`,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

export function isUrlDead(result: UrlValidationResult): boolean {
  if (!result.valid) return true;

  if (result.statusCode && INVALID_STATUS_CODES.includes(result.statusCode)) {
    return true;
  }

  if (result.redirectCount > MAX_REDIRECTS - 2) {
    return true;
  }

  return false;
}

export function getValidationSummary(results: UrlValidationResult[]): {
  total: number;
  valid: number;
  invalid: number;
  withRedirects: number;
  deadLinks: number;
  averageResponseTimeMs: number;
} {
  const valid = results.filter((r) => r.valid).length;
  const withRedirects = results.filter((r) => r.redirectCount > 0).length;
  const deadLinks = results.filter((r) => isUrlDead(r)).length;
  const totalResponseTime = results.reduce(
    (sum, r) => sum + r.responseTimeMs,
    0,
  );

  return {
    total: results.length,
    valid,
    invalid: results.length - valid,
    withRedirects,
    deadLinks,
    averageResponseTimeMs:
      results.length > 0 ? Math.round(totalResponseTime / results.length) : 0,
  };
}
