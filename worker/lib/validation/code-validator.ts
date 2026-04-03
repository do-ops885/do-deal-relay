/**
 * Code Validator Module
 *
 * Validates referral code formats and verifies code existence on referral pages.
 * Tests code redemption possibilities where applicable.
 *
 * Features:
 * - Format validation per provider
 * - Code existence verification on pages
 * - Redemption testing (where possible)
 * - Provider-specific validation rules
 */

import type { Deal, Env } from "../../types";
import { logger } from "../global-logger";
import { CircuitBreaker, getSourceCircuitBreaker } from "../circuit-breaker";
import { CONFIG } from "../../config";

// ============================================================================
// Types
// ============================================================================

export interface CodeValidationResult {
  code: string;
  provider: string;
  valid: boolean;
  formatValid: boolean;
  existsOnPage?: boolean;
  redeemable?: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    normalizedCode?: string;
    similarCodes?: string[];
    detectedProvider?: string;
  };
  timestamp: string;
}

export interface PageValidationResult {
  codeFound: boolean;
  context?: string;
  similarCodes: string[];
  pageTitle?: string;
  pageAccessible: boolean;
  error?: string;
}

export interface RedemptionTestResult {
  testable: boolean;
  tested: boolean;
  redeemable?: boolean;
  error?: string;
  requiresManualVerification: boolean;
}

// ============================================================================
// Provider-Specific Code Formats
// ============================================================================

interface ProviderFormat {
  name: string;
  patterns: RegExp[];
  minLength: number;
  maxLength: number;
  allowedChars: RegExp;
  caseSensitive: boolean;
  examples: string[];
}

const PROVIDER_FORMATS: Record<string, ProviderFormat> = {
  generic: {
    name: "Generic",
    patterns: [/^[A-Za-z0-9_-]+$/],
    minLength: 3,
    maxLength: 50,
    allowedChars: /^[A-Za-z0-9_-]+$/,
    caseSensitive: false,
    examples: ["REFERRAL123", "FRIEND50", "WELCOME2024"],
  },
  trading212: {
    name: "Trading 212",
    patterns: [/^[A-Z]{2,}[0-9]+[A-Z]*$/i, /^[A-Z0-9]{6,20}$/i],
    minLength: 6,
    maxLength: 20,
    allowedChars: /^[A-Za-z0-9]+$/,
    caseSensitive: false,
    examples: ["IITSL ltd", "WEALTH20", "INVEST50"],
  },
  crypto: {
    name: "Cryptocurrency Exchange",
    patterns: [/^[A-Z0-9]{6,16}$/i, /^[A-Z]+[0-9]{4,}$/i],
    minLength: 6,
    maxLength: 16,
    allowedChars: /^[A-Za-z0-9]+$/,
    caseSensitive: true,
    examples: ["BINANCE20", "COINBASE", "CRYPTO100"],
  },
  fintech: {
    name: "Fintech",
    patterns: [/^[A-Z0-9_-]{4,30}$/i],
    minLength: 4,
    maxLength: 30,
    allowedChars: /^[A-Za-z0-9_-]+$/,
    caseSensitive: false,
    examples: ["REVOLUT20", "MONZO50", "STARLING"],
  },
  bank: {
    name: "Bank",
    patterns: [/^[A-Z0-9]{4,12}$/i, /^[A-Z]{3,}[0-9]{2,}$/i],
    minLength: 4,
    maxLength: 12,
    allowedChars: /^[A-Za-z0-9]+$/,
    caseSensitive: false,
    examples: ["CHASE500", "AMEX100", "CITI50"],
  },
};

// ============================================================================
// Code Format Validation
// ============================================================================

/**
 * Validate referral code format for a specific provider
 *
 * Checks code length, allowed characters, and provider-specific patterns.
 *
 * @param code - Referral code to validate
 * @param provider - Provider identifier (or "auto" for auto-detection)
 * @returns Validation result with format details
 * @example
 * ```typescript
 * const result = validateCodeFormat("REFERRAL123", "generic");
 * if (!result.valid) {
 *   console.log(`Invalid code format: ${result.errors.join(", ")}`);
 * }
 * ```
 */
export function validateCodeFormat(
  code: string,
  provider: string,
): CodeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const timestamp = new Date().toISOString();

  // Basic validation
  if (!code || typeof code !== "string") {
    return {
      code: code || "",
      provider,
      valid: false,
      formatValid: false,
      errors: ["Code is required"],
      warnings: [],
      timestamp,
    };
  }

  const trimmedCode = code.trim();

  if (trimmedCode.length === 0) {
    return {
      code: trimmedCode,
      provider,
      valid: false,
      formatValid: false,
      errors: ["Code cannot be empty"],
      warnings: [],
      timestamp,
    };
  }

  // Get provider format
  const format = PROVIDER_FORMATS[provider] || PROVIDER_FORMATS.generic;

  // Check length
  if (trimmedCode.length < format.minLength) {
    errors.push(
      `Code too short: ${trimmedCode.length} chars (min: ${format.minLength})`,
    );
  }
  if (trimmedCode.length > format.maxLength) {
    errors.push(
      `Code too long: ${trimmedCode.length} chars (max: ${format.maxLength})`,
    );
  }

  // Check allowed characters
  if (!format.allowedChars.test(trimmedCode)) {
    errors.push(
      `Code contains invalid characters. Allowed: ${format.allowedChars.toString()}`,
    );
  }

  // Check against patterns
  let patternMatch = false;
  for (const pattern of format.patterns) {
    if (pattern.test(trimmedCode)) {
      patternMatch = true;
      break;
    }
  }

  if (!patternMatch && format.patterns.length > 0) {
    warnings.push("Code doesn't match expected pattern for this provider");
  }

  // Normalize code (uppercase if not case sensitive)
  const normalizedCode = format.caseSensitive
    ? trimmedCode
    : trimmedCode.toUpperCase();

  const formatValid = errors.length === 0;

  logger.info(`Code format validation: ${trimmedCode}`, {
    component: "code-validator",
    provider,
    valid: formatValid,
    errorCount: errors.length,
  });

  return {
    code: trimmedCode,
    provider,
    valid: formatValid,
    formatValid,
    errors,
    warnings,
    metadata: {
      normalizedCode,
      detectedProvider:
        provider === "auto" ? detectProvider(trimmedCode) : provider,
    },
    timestamp,
  };
}

/**
 * Auto-detect provider based on code format
 */
function detectProvider(code: string): string {
  for (const [key, format] of Object.entries(PROVIDER_FORMATS)) {
    if (key === "generic") continue;

    for (const pattern of format.patterns) {
      if (pattern.test(code)) {
        return key;
      }
    }
  }

  return "generic";
}

/**
 * Get list of supported providers
 */
export function getSupportedProviders(): string[] {
  return Object.keys(PROVIDER_FORMATS);
}

/**
 * Get provider format details
 */
export function getProviderFormat(provider: string): ProviderFormat | null {
  return PROVIDER_FORMATS[provider] || null;
}

// ============================================================================
// Page Code Validation
// ============================================================================

/**
 * Validate that a code exists on a referral page
 *
 * Fetches the page and searches for the code in the content.
 * Also looks for similar codes that might be variations.
 *
 * @param code - Code to search for
 * @param url - URL of the referral page
 * @param env - Worker environment
 * @returns Page validation result
 * @example
 * ```typescript
 * const result = await validateCodeOnPage("REF123", "https://example.com/refer", env);
 * if (!result.codeFound) {
 *   console.log("Code not found on page - may be expired");
 * }
 * ```
 */
export async function validateCodeOnPage(
  code: string,
  url: string,
  env?: Env,
): Promise<PageValidationResult> {
  logger.info(`Validating code on page: ${code} at ${url}`, {
    component: "code-validator",
  });

  const domain = extractDomain(url);

  // Get circuit breaker for this domain
  const breaker = env
    ? getSourceCircuitBreaker(domain, env)
    : new CircuitBreaker(`validate-code:${domain}`, {
        failureThreshold: 3,
        resetTimeoutMs: 60000,
        halfOpenMaxCalls: 2,
      });

  try {
    const result = await breaker.execute(async () => {
      return await fetchAndValidateCode(code, url);
    });

    logger.info(`Page code validation completed`, {
      component: "code-validator",
      codeFound: result.codeFound,
      similarCodes: result.similarCodes.length,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Validation failed";

    logger.error(`Page code validation failed`, {
      component: "code-validator",
      error: errorMessage,
    });

    return {
      codeFound: false,
      similarCodes: [],
      pageAccessible: false,
      error: errorMessage,
    };
  }
}

/**
 * Fetch page and validate code exists
 */
async function fetchAndValidateCode(
  code: string,
  url: string,
): Promise<PageValidationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        codeFound: false,
        similarCodes: [],
        pageAccessible: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    const pageTitle = extractTitle(html);

    // Search for code in HTML
    const { found, context, similarCodes } = findCodeInHtml(code, html);

    return {
      codeFound: found,
      context,
      similarCodes,
      pageTitle,
      pageAccessible: true,
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Extract title from HTML
 */
function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim();
}

/**
 * Find code in HTML content
 */
function findCodeInHtml(
  code: string,
  html: string,
): { found: boolean; context?: string; similarCodes: string[] } {
  const normalizedCode = code.toUpperCase();
  const upperHtml = html.toUpperCase();

  // Direct match
  const found = upperHtml.includes(normalizedCode);

  // Get context if found
  let context: string | undefined;
  if (found) {
    const index = upperHtml.indexOf(normalizedCode);
    const start = Math.max(0, index - 50);
    const end = Math.min(html.length, index + normalizedCode.length + 50);
    context = html.slice(start, end).replace(/\s+/g, " ");
  }

  // Find similar codes (same prefix or pattern)
  const similarCodes: string[] = [];
  const codePattern = /[A-Z0-9_-]{4,30}/gi;
  const matches = html.match(codePattern) || [];

  for (const match of matches) {
    const normalized = match.toUpperCase();
    if (
      normalized !== normalizedCode &&
      !similarCodes.includes(normalized) &&
      isSimilarCode(normalizedCode, normalized)
    ) {
      similarCodes.push(normalized);
    }

    // Limit similar codes
    if (similarCodes.length >= 5) break;
  }

  return { found, context, similarCodes };
}

/**
 * Check if two codes are similar
 */
function isSimilarCode(code1: string, code2: string): boolean {
  // Same prefix (first 3 chars)
  if (code1.slice(0, 3) === code2.slice(0, 3)) return true;

  // Same suffix (last 3 chars)
  if (code1.slice(-3) === code2.slice(-3)) return true;

  // Levenshtein distance (for small differences)
  if (levenshteinDistance(code1, code2) <= 2) return true;

  return false;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// ============================================================================
// Code Redemption Testing
// ============================================================================

/**
 * Test if a referral code is redeemable
 *
 * Attempts to validate code without actually redeeming it.
 * Note: Most providers don't expose APIs for this, so manual
 * verification may be required.
 *
 * @param code - Code to test
 * @param domain - Provider domain
 * @returns Redemption test result
 * @example
 * ```typescript
 * const result = await testCodeRedemption("REF123", "example.com");
 * if (!result.redeemable && result.requiresManualVerification) {
 *   console.log("Manual verification needed");
 * }
 * ```
 */
export async function testCodeRedemption(
  code: string,
  domain: string,
): Promise<RedemptionTestResult> {
  logger.info(`Testing code redemption: ${code} at ${domain}`, {
    component: "code-validator",
  });

  // Most providers don't expose redemption testing APIs
  // This is a placeholder that indicates manual verification is needed

  // Check if we have known redemption endpoints for this domain
  const knownEndpoints = getRedemptionEndpoints(domain);

  if (knownEndpoints.length === 0) {
    return {
      testable: false,
      tested: false,
      requiresManualVerification: true,
      error: "No automated redemption testing available for this provider",
    };
  }

  // Try known endpoints
  for (const endpoint of knownEndpoints) {
    try {
      const result = await tryRedemptionEndpoint(code, endpoint);
      if (result.tested) {
        return result;
      }
    } catch {
      // Continue to next endpoint
    }
  }

  return {
    testable: true,
    tested: false,
    requiresManualVerification: true,
    error: "Could not verify redemption status",
  };
}

/**
 * Get known redemption endpoints for a domain
 */
function getRedemptionEndpoints(domain: string): string[] {
  // Known endpoints for testing redemption (rarely available)
  const endpoints: Record<string, string[]> = {
    "trading212.com": ["/api/v1/referral/validate"],
    // Add more as discovered
  };

  return endpoints[domain] || [];
}

/**
 * Try to validate code via redemption endpoint
 */
async function tryRedemptionEndpoint(
  _code: string,
  _endpoint: string,
): Promise<RedemptionTestResult> {
  // This would make an actual API call to test redemption
  // For now, we mark as requiring manual verification
  return {
    testable: true,
    tested: false,
    requiresManualVerification: true,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

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

/**
 * Complete code validation (format + page + redemption)
 */
export async function validateCodeComplete(
  code: string,
  provider: string,
  url: string,
  env?: Env,
): Promise<CodeValidationResult> {
  const timestamp = new Date().toISOString();

  // Step 1: Format validation
  const formatResult = validateCodeFormat(code, provider);
  if (!formatResult.valid) {
    return formatResult;
  }

  // Step 2: Page validation
  const pageResult = await validateCodeOnPage(code, url, env);

  // Step 3: Redemption test (if available)
  const domain = extractDomain(url);
  const redemptionResult = await testCodeRedemption(code, domain);

  // Combine results
  const errors = [...formatResult.errors];
  const warnings = [...formatResult.warnings];

  if (!pageResult.pageAccessible) {
    errors.push(`Referral page not accessible: ${pageResult.error}`);
  } else if (!pageResult.codeFound) {
    warnings.push("Code not found on referral page");
    if (pageResult.similarCodes.length > 0) {
      warnings.push(
        `Similar codes found: ${pageResult.similarCodes.join(", ")}`,
      );
    }
  }

  if (redemptionResult.requiresManualVerification) {
    warnings.push("Redemption status requires manual verification");
  }

  const valid =
    formatResult.valid &&
    pageResult.pageAccessible &&
    (pageResult.codeFound || !redemptionResult.requiresManualVerification);

  return {
    code,
    provider,
    valid,
    formatValid: formatResult.valid,
    existsOnPage: pageResult.codeFound,
    redeemable: redemptionResult.redeemable,
    errors,
    warnings,
    metadata: {
      normalizedCode: formatResult.metadata?.normalizedCode,
      similarCodes: pageResult.similarCodes,
      detectedProvider: formatResult.metadata?.detectedProvider,
    },
    timestamp,
  };
}

/**
 * Batch validate multiple codes
 */
export async function validateCodesBatch(
  codes: Array<{ code: string; provider: string; url: string }>,
  env?: Env,
): Promise<CodeValidationResult[]> {
  const results: CodeValidationResult[] = [];

  // Add delay between validations to be respectful
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  for (const item of codes) {
    try {
      const result = await validateCodeComplete(
        item.code,
        item.provider,
        item.url,
        env,
      );
      results.push(result);

      // Small delay between requests
      await delay(500);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      results.push({
        code: item.code,
        provider: item.provider,
        valid: false,
        formatValid: false,
        errors: [errorMessage],
        warnings: [],
        timestamp: new Date().toISOString(),
      });
    }
  }

  return results;
}
