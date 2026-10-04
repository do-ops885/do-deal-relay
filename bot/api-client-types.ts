import type { ReferralInput } from "../worker/types";

// ============================================================================
// API Client Configuration
// ============================================================================

export interface APIClientConfig {
  baseUrl: string;
  apiKey?: string | undefined;
  timeoutMs?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface CreateReferralResponse {
  success: boolean;
  message: string;
  referral: {
    id: string;
    code: string;
    url: string;
    domain: string;
    status: string;
  };
}

export interface GetReferralResponse {
  referral: ReferralInput;
}

export interface SearchReferralsResponse {
  referrals: ReferralInput[];
  total: number;
  limit: number;
  offset: number;
}

export interface DeactivateReferralResponse {
  success: boolean;
  message: string;
  referral: {
    id: string;
    code: string;
    url: string;
    domain: string;
    status: string;
    deactivated_at?: string;
    reason?: string;
  };
}

export interface ReactivateReferralResponse {
  success: boolean;
  message: string;
  referral: {
    id: string;
    code: string;
    url: string;
    domain: string;
    status: string;
  };
}

export interface ResearchResponse {
  success: boolean;
  message: string;
  query: string;
  domain?: string;
  discovered_codes: number;
  stored_referrals: number;
  research_metadata: {
    sources_checked: string[];
    search_queries: string[];
    research_duration_ms: number;
    agent_id: string;
  };
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  checks: {
    kv_connection: boolean;
    last_run_success: boolean;
    snapshot_valid: boolean;
  };
  last_run?: {
    run_id: string;
    timestamp: string;
    duration_ms: number;
    deals_count: number;
  };
}

export interface APIError {
  error: string;
  message?: string;
  details?: unknown;
}
