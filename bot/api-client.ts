import {
  ReferralInput,
  ReferralSearchQuery,
  ReferralDeactivateBody,
  WebResearchRequest,
} from "../worker/types";

// ============================================================================
// API Client Configuration
// ============================================================================

export interface APIClientConfig {
  baseUrl: string;
  apiKey?: string;
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

// ============================================================================
// DealRelay API Client
// ============================================================================

export class DealRelayAPI {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(config: APIClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs || 30000; // Default 30s timeout
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-JSON responses (like health checks)
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        if (!response.ok) {
          throw new APIClientError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
          );
        }
        return (await response.text()) as T;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new APIClientError(
          (data as APIError).error || `HTTP ${response.status}`,
          response.status,
          data,
        );
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof APIClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new APIClientError(
          `Request timeout after ${this.timeoutMs}ms`,
          408,
        );
      }

      throw new APIClientError(
        error instanceof Error ? error.message : "Unknown error",
        500,
      );
    }
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Health check
   */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  /**
   * Create a new referral
   * CRITICAL: Always use complete URLs
   */
  async createReferral(input: {
    code: string;
    url: string;
    domain: string;
    source?: string;
    submitted_by?: string;
    metadata?: {
      title?: string;
      description?: string;
      reward_type?: string;
      reward_value?: string | number;
      currency?: string;
      category?: string[];
      tags?: string[];
      confidence_score?: number;
      notes?: string;
    };
  }): Promise<CreateReferralResponse> {
    return this.request<CreateReferralResponse>("/api/referrals", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        source: input.source || "bot",
        submitted_by: input.submitted_by || "bot",
      }),
    });
  }

  /**
   * Get referral by code
   */
  async getReferral(code: string): Promise<GetReferralResponse> {
    return this.request<GetReferralResponse>(`/api/referrals/${code}`);
  }

  /**
   * Search referrals with filters
   */
  async searchReferrals(
    filters: Omit<ReferralSearchQuery, "limit" | "offset"> & {
      limit?: number;
      offset?: number;
    },
  ): Promise<SearchReferralsResponse> {
    const params = new URLSearchParams();

    if (filters.domain) params.set("domain", filters.domain);
    if (filters.status) params.set("status", filters.status);
    if (filters.category) params.set("category", filters.category);
    if (filters.source) params.set("source", filters.source);
    if (filters.limit) params.set("limit", filters.limit.toString());
    if (filters.offset) params.set("offset", filters.offset.toString());

    const queryString = params.toString();
    const endpoint = queryString
      ? `/api/referrals?${queryString}`
      : "/api/referrals";

    return this.request<SearchReferralsResponse>(endpoint);
  }

  /**
   * Deactivate a referral code
   */
  async deactivateReferral(
    code: string,
    reason: ReferralDeactivateBody["reason"],
    options?: {
      replaced_by?: string;
      notes?: string;
    },
  ): Promise<DeactivateReferralResponse> {
    return this.request<DeactivateReferralResponse>(
      `/api/referrals/${code}/deactivate`,
      {
        method: "POST",
        body: JSON.stringify({
          code,
          reason,
          replaced_by: options?.replaced_by,
          notes: options?.notes,
        }),
      },
    );
  }

  /**
   * Reactivate a referral code
   */
  async reactivateReferral(code: string): Promise<ReactivateReferralResponse> {
    return this.request<ReactivateReferralResponse>(
      `/api/referrals/${code}/reactivate`,
      {
        method: "POST",
      },
    );
  }

  /**
   * Execute web research for a domain/query
   */
  async research(request: WebResearchRequest): Promise<ResearchResponse> {
    return this.request<ResearchResponse>("/api/research", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get research results for a domain
   */
  async getResearchResults(domain: string): Promise<{
    domain: string;
    discovered_codes: Array<{
      code: string;
      url: string;
      source: string;
      discovered_at: string;
      reward_summary?: string;
      confidence: number;
    }>;
    research_metadata: {
      sources_checked: string[];
      search_queries: string[];
      research_duration_ms: number;
      agent_id: string;
    };
  }> {
    return this.request(`/api/research/${domain}`);
  }
}

// ============================================================================
// Custom Error Class
// ============================================================================

export class APIClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "APIClientError";
  }
}

// ============================================================================
// Error Message Helper
// ============================================================================

export function getErrorMessage(error: unknown): string {
  if (error instanceof APIClientError) {
    // Map HTTP status codes to user-friendly messages
    const statusMessages: Record<number, string> = {
      400: "❌ Invalid request. Please check your input.",
      401: "🔒 Authentication failed. Please check your API key.",
      403: "🚫 You don't have permission to perform this action.",
      404: "🔍 Referral not found. Please check the code.",
      409: "⚠️ This referral code already exists in the system.",
      429: "⏳ Too many requests. Please wait a moment and try again.",
      500: "🔧 System error. Please try again later.",
      503: "🔧 Service temporarily unavailable. Please try again later.",
      408: "⏱️ Request timed out. The server might be busy.",
    };

    return statusMessages[error.statusCode] || `❌ ${error.message}`;
  }

  if (error instanceof Error) {
    return `❌ ${error.message}`;
  }

  return "❌ An unexpected error occurred.";
}

// ============================================================================
// Singleton Instance (for bot usage)
// ============================================================================

let apiClient: DealRelayAPI | null = null;

export function getAPIClient(config?: APIClientConfig): DealRelayAPI {
  if (!apiClient && !config) {
    throw new Error(
      "API client not initialized. Provide config or call initAPIClient first.",
    );
  }

  if (config) {
    apiClient = new DealRelayAPI(config);
  }

  return apiClient!;
}

export function initAPIClient(config: APIClientConfig): void {
  apiClient = new DealRelayAPI(config);
}
