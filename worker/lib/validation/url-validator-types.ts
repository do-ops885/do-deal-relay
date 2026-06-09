/**
 * Types and constants for URL validation.
 */

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

export interface RedirectInfo {
  url: string;
  statusCode: number;
  location?: string;
}

export const VALIDATION_TIMEOUT_MS = 15000;
export const MAX_REDIRECTS = 5;
export const RATE_LIMIT_DELAY_MS = 500;
export const MAX_BATCH_SIZE = 50;

export const INVALID_STATUS_CODES = [404, 410, 451, 500, 502, 503, 504];
export const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];
