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

export interface ProviderFormat {
  name: string;
  patterns: RegExp[];
  minLength: number;
  maxLength: number;
  allowedChars: RegExp;
  caseSensitive: boolean;
  examples: string[];
}
