import type { Env } from "../../types";
import { logger } from "../global-logger";
import type {
  CodeValidationResult,
  PageValidationResult,
  RedemptionTestResult,
  ProviderFormat,
} from "./code-validator-types";
import { validateCodeOnPage, testCodeRedemption } from "./page-validation";

export type {
  CodeValidationResult,
  PageValidationResult,
  RedemptionTestResult,
  ProviderFormat,
} from "./code-validator-types";

export { validateCodeOnPage, testCodeRedemption } from "./page-validation";

// ============================================================================
// Provider-Specific Code Formats
// ============================================================================

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
    examples: ["HE123456", "WEALTH20", "INVEST50"],
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

export function validateCodeFormat(
  code: string,
  provider: string,
): CodeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const timestamp = new Date().toISOString();

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

  const format = PROVIDER_FORMATS[provider] ?? PROVIDER_FORMATS.generic!;

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

  if (!format.allowedChars.test(trimmedCode)) {
    errors.push(
      `Code contains invalid characters. Allowed: ${format.allowedChars.toString()}`,
    );
  }

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

export function getSupportedProviders(): string[] {
  return Object.keys(PROVIDER_FORMATS);
}

export function getProviderFormat(provider: string): ProviderFormat | null {
  return PROVIDER_FORMATS[provider] || null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

// ============================================================================
// Complete Code Validation
// ============================================================================

export async function validateCodeComplete(
  code: string,
  provider: string,
  url: string,
  env?: Env,
): Promise<CodeValidationResult> {
  const timestamp = new Date().toISOString();

  const formatResult = validateCodeFormat(code, provider);
  if (!formatResult.valid) {
    return formatResult;
  }

  const pageResult = await validateCodeOnPage(code, url, env);

  const domain = extractDomain(url);
  const redemptionResult = await testCodeRedemption(code, domain);

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

export async function validateCodesBatch(
  codes: Array<{ code: string; provider: string; url: string }>,
  env?: Env,
): Promise<CodeValidationResult[]> {
  const results: CodeValidationResult[] = [];

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
