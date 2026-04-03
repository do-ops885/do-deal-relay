/**
 * URL Validator Module
 *
 * Validates deal URLs by checking their health status, detecting redirects,
 * and batch processing multiple URLs with circuit breaker protection.
 *
 * Features:
 * - HEAD request validation with fallback to GET
 * - Redirect chain detection and following
 * - Batch validation for efficiency
 * - Circuit breaker protection for external requests
 * - Respectful rate limiting between requests
 */

import { CircuitBreaker, getSourceCircuitBreaker } from "../circuit-breaker";
import type { Env } from "../../types";
import { logger } from "../global-logger";
import { CONFIG } from "../../config";

// ============================================================================
// Types
// ============================================================================

export interface UrlValidationResult {
  url: string;
  valid: boolean;
  statusCode?: number;
  statusText?: string;
  redirectCount: number;
  redirectChain: string[];
  finalUrl: string;
  responseTimeMs: number;
  error?: string;
  timestamp: string;
}

export interface BatchValidationResult {
  results: UrlValidationResult[];
  validCount: number;
  invalidCount: number;
  redirectCount: number;
  totalTimeMs: number;
  errors: string[];
}

interface RedirectInfo {
  url: string;
  statusCode: number;
  location?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALIDATION_TIMEOUT_MS = 15000; // 15 seconds
const MAX_REDIRECTS = 5;
const RATE_LIMIT_DELAY_MS = 500; // 500ms between requests to same domain
const MAX_BATCH_SIZE = 50;

// Status codes that indicate invalid/dead deals
const INVALID_STATUS_CODES = [404, 410, 451, 500, 502, 503, 504];
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

// ============================================================================
// Domain Rate Limiting
// ============================================================================

const lastRequestTime = new Map<string, number>();

/**
 * Rate limit requests to the same domain to be respectful
 */
async function respectRateLimit(domain: string): Promise<void> {
  const lastTime = lastRequestTime.get(domain) || 0;
  const now = Date.now();
  const elapsed = now - lastTime;

  if (elapsed < RATE_LIMIT_DELAY_MS) {
    const delay = RATE_LIMIT_DELAY_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime.set(domain, Date.now());
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate a single URL with circuit breaker protection
 *
 * Performs HEAD request first, falls back to GET if needed.
 * Follows redirect chains up to MAX_REDIRECTS.
 *
 * @param url - URL to validate
 * @param env - Worker environment for circuit breaker
 * @returns Validation result with status and redirect info
 * @example
 * ```typescript
 * const result = await validateUrl("https://example.com/deal", env);
 * if (!result.valid) {
 *   console.log(`Deal URL invalid: ${result.error}`);
 * }
 * ```
 */
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

  // Respect rate limit for this domain
  await respectRateLimit(domain);

  // Get circuit breaker for this domain
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

/**
 * Perform the actual URL validation with redirect following
 */
async function performUrlValidation(url: string): Promise<UrlValidationResult> {
  const redirectChain: string[] = [url];
  let currentUrl = url;
  let redirectCount = 0;
  let finalStatusCode: number | undefined;
  let finalStatusText: string | undefined;

  while (redirectCount <= MAX_REDIRECTS) {
    try {
      // Try HEAD request first (lighter)
      const headResult = await tryHeadRequest(currentUrl);

      if (headResult.success) {
        finalStatusCode = headResult.statusCode;
        finalStatusText = headResult.statusText;

        // Check if it's a redirect
        if (
          headResult.statusCode &&
          REDIRECT_STATUS_CODES.includes(headResult.statusCode) &&
          headResult.location
        ) {
          const nextUrl = resolveUrl(currentUrl, headResult.location);
          if (redirectChain.includes(nextUrl)) {
            // Redirect loop detected
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

        // Check for invalid status codes
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

        // Success
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

      // HEAD failed, try GET as fallback
      const getResult = await tryGetRequest(currentUrl);

      if (getResult.success) {
        finalStatusCode = getResult.statusCode;
        finalStatusText = getResult.statusText;

        // Check for invalid status
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

        // Success with GET
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

      // Both failed
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

      // Network error or timeout
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

  // Max redirects exceeded
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

/**
 * Try HEAD request to validate URL
 */
async function tryHeadRequest(url: string): Promise<{
  success: boolean;
  statusCode?: number;
  statusText?: string;
  location?: string;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    const response = await fetch(url, {
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

    return {
      success: true,
      statusCode: response.status,
      statusText: response.statusText,
      location: response.headers.get("location") || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "HEAD request failed",
    };
  }
}

/**
 * Try GET request as fallback
 */
async function tryGetRequest(url: string): Promise<{
  success: boolean;
  statusCode?: number;
  statusText?: string;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "GET",
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

    return {
      success: true,
      statusCode: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "GET request failed",
    };
  }
}

/**
 * Resolve relative URL to absolute
 */
function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

// ============================================================================
// Batch Validation
// ============================================================================

/**
 * Validate multiple URLs in batch
 *
 * Processes URLs with rate limiting between requests to same domain.
 * Returns comprehensive results with statistics.
 *
 * @param urls - Array of URLs to validate
 * @param env - Worker environment
 * @returns Batch validation results
 * @example
 * ```typescript
 * const results = await checkUrlStatusBatch(
 *   ["https://example.com/1", "https://example.com/2"],
 *   env
 * );
 * console.log(`${results.validCount} valid, ${results.invalidCount} invalid`);
 * ```
 */
export async function checkUrlStatusBatch(
  urls: string[],
  env?: Env,
): Promise<BatchValidationResult> {
  const startTime = Date.now();

  logger.info(`Starting batch URL validation for ${urls.length} URLs`, {
    component: "url-validator",
    batchSize: urls.length,
  });

  // Limit batch size
  const limitedUrls = urls.slice(0, MAX_BATCH_SIZE);

  // Group by domain for rate limiting
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

  // Process each domain group with delays
  for (const [domain, domainUrls] of domainGroups) {
    for (const url of domainUrls) {
      try {
        const result = await validateUrl(url, env);
        results.push(result);

        // Small delay between requests to same domain
        if (domainUrls.length > 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, RATE_LIMIT_DELAY_MS),
          );
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

/**
 * Detect and follow redirect chain for a URL
 *
 * Returns full redirect chain information without marking URL as invalid.
 *
 * @param url - URL to check for redirects
 * @returns Full redirect chain
 * @example
 * ```typescript
 * const redirects = await detectRedirects("https://bit.ly/abc123");
 * console.log(`Redirects through: ${redirects.redirectChain.join(" -> ")}`);
 * ```
 */
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
      const timeout = setTimeout(
        () => controller.abort(),
        VALIDATION_TIMEOUT_MS,
      );

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

      // Check for redirect
      const location = response.headers.get("location");
      if (location && REDIRECT_STATUS_CODES.includes(response.status)) {
        const nextUrl = resolveUrl(currentUrl, location);

        // Check for loop
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

      // No redirect, we're done
      const responseTime = Date.now() - startTime;

      // Check if final URL is valid
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

  // Max redirects exceeded
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

/**
 * Check if a URL validation indicates a dead/broken deal
 */
export function isUrlDead(result: UrlValidationResult): boolean {
  if (!result.valid) return true;

  // Check for specific invalid status codes
  if (result.statusCode && INVALID_STATUS_CODES.includes(result.statusCode)) {
    return true;
  }

  // Check for excessive redirects (might indicate link rot)
  if (result.redirectCount > MAX_REDIRECTS - 2) {
    return true;
  }

  return false;
}

/**
 * Get validation summary for reporting
 */
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
