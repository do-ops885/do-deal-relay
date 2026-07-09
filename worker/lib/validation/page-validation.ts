import type { Env } from "../../types";
import { logger } from "../global-logger";
import { CircuitBreaker, getSourceCircuitBreaker } from "../circuit-breaker";
import { CONFIG } from "../../config";
import { validatedFetch } from "../security";
import type {
  PageValidationResult,
  RedemptionTestResult,
} from "./code-validator-types";

export async function validateCodeOnPage(
  code: string,
  url: string,
  env?: Env,
): Promise<PageValidationResult> {
  logger.info(`Validating code on page: ${code} at ${url}`, {
    component: "code-validator",
  });

  const domain = extractDomain(url);

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

async function fetchAndValidateCode(
  code: string,
  url: string,
): Promise<PageValidationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await validatedFetch(url, {
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

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim();
}

function findCodeInHtml(
  code: string,
  html: string,
): { found: boolean; context?: string; similarCodes: string[] } {
  const normalizedCode = code.toUpperCase();
  const upperHtml = html.toUpperCase();

  const found = upperHtml.includes(normalizedCode);

  let context: string | undefined;
  if (found) {
    const index = upperHtml.indexOf(normalizedCode);
    const start = Math.max(0, index - 50);
    const end = Math.min(html.length, index + normalizedCode.length + 50);
    context = html.slice(start, end).replace(/\s+/g, " ");
  }

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

    if (similarCodes.length >= 5) break;
  }

  return { found, context, similarCodes };
}

function isSimilarCode(code1: string, code2: string): boolean {
  if (code1.slice(0, 3) === code2.slice(0, 3)) return true;
  if (code1.slice(-3) === code2.slice(-3)) return true;
  if (levenshteinDistance(code1, code2) <= 2) return true;
  return false;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  const firstRow = matrix[0];
  if (firstRow) {
    for (let j = 0; j <= str1.length; j++) {
      firstRow[j] = j;
    }
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      const prevRow = matrix[i - 1];
      const currRow = matrix[i];
      if (prevRow && currRow) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          currRow[j] = prevRow[j - 1] ?? 0;
        } else {
          currRow[j] =
            Math.min(
              (prevRow[j - 1] ?? 0) + 1,
              (currRow[j - 1] ?? 0) + 1,
              (prevRow[j] ?? 0) + 1,
            ) ?? 0;
        }
      }
    }
  }

  return matrix[str2.length]?.[str1.length] ?? 0;
}

export async function testCodeRedemption(
  code: string,
  domain: string,
): Promise<RedemptionTestResult> {
  logger.info(`Testing code redemption: ${code} at ${domain}`, {
    component: "code-validator",
  });

  const knownEndpoints = getRedemptionEndpoints(domain);

  if (knownEndpoints.length === 0) {
    return {
      testable: false,
      tested: false,
      requiresManualVerification: true,
      error: "No automated redemption testing available for this provider",
    };
  }

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

function getRedemptionEndpoints(domain: string): string[] {
  const endpoints: Record<string, string[]> = {
    "trading212.com": ["/api/v1/referral/validate"],
  };

  return endpoints[domain] || [];
}

async function tryRedemptionEndpoint(
  _code: string,
  _endpoint: string,
): Promise<RedemptionTestResult> {
  return {
    testable: true,
    tested: false,
    requiresManualVerification: true,
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
