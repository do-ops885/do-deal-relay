/**
 * CLI Type Definitions
 * Type definitions for the referral CLI tool
 */

// Configuration types
export interface Config {
  endpoint: string;
  apiKey?: string;
  defaultOutput: "table" | "json" | "csv" | "yaml";
}

// CLI Parser types
export interface ParsedArgs {
  command: string;
  subcommand: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

// URL Parser types
export interface ParsedReferralUrl {
  url: string;
  domain: string;
  code: string;
  path: string;
}

// API Response types
export interface ReferralResponse {
  success: boolean;
  referral: unknown;
}

export interface ReferralListResponse {
  referrals: unknown[];
  total: number;
}

export interface ResearchResponse {
  success: boolean;
  discovered_codes: number;
  stored_referrals: number;
  research_metadata: unknown;
}

export interface ResearchResultsResponse {
  discovered_codes: unknown[];
  research_metadata: unknown;
}
