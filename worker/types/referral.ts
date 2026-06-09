import { z } from "zod";
import type { Deal } from "./deal";

// ============================================================================
// Referral System Types
// ============================================================================

export interface ReferralInput {
  id?: string;
  url: string;
  code: string;
  domain?: string;
  description?: string;
  reward?: string;
  expiry_date?: string;
  source?: string;
  status?: string;
  submitted_at?: string;
  submitted_by?: string;
  expires_at?: string;
  deactivated_at?: string;
  deactivated_reason?: string;
  related_codes?: string[];
  metadata?: {
    title?: string;
    description?: string;
    reward_type?: string;
    reward_value?: string | number;
    category?: string[];
    tags?: string[];
    requirements?: string[];
    confidence_score?: number;
    notes?: string;
    research_sources?: string[];
    [key: string]: unknown;
  };
  validation?: {
    last_validated?: string;
    is_valid?: boolean;
    checked_urls?: string[];
  };
}

export interface ReferralDeactivateBody {
  id: string;
  reason?: string;
  replaced_by?: string;
  notes?: string;
}

export interface ReferralSearchQuery {
  q?: string;
  domain?: string;
  status?: "active" | "inactive" | "expired" | "all";
  category?: string;
  source?: string;
  active_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface ReferralResearchResult {
  query: string;
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
    errors?: string[];
    used_real_fetching?: boolean;
  };
}

export interface WebResearchRequest {
  query: string;
  url?: string;
  domain?: string;
  depth?: "quick" | "thorough" | "deep";
  sources?: string[];
  max_results?: number;
  options?: {
    use_real_fetching?: boolean;
    skip_cache?: boolean;
    timeout_ms?: number;
  };
}

export interface ExpiringDeal {
  deal: Deal;
  daysUntilExpiry: number;
  notificationWindow: "7d" | "30d" | "90d";
}

// ============================================================================
// Referral Schemas
// ============================================================================

export const ReferralInputSchema = z.object({
  id: z.string().optional(),
  url: z.string().url(),
  code: z.string().min(1),
  description: z.string().optional(),
  reward: z.string().optional(),
  expiry_date: z.string().datetime().optional(),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ReferralDeactivateBodySchema = z.object({
  id: z.string(),
  reason: z.string().optional(),
  replaced_by: z.string().optional(),
  notes: z.string().optional(),
});

export const ReferralSearchQuerySchema = z.object({
  q: z.string().optional(),
  domain: z.string().optional(),
  status: z.enum(["active", "inactive", "expired", "all"]).optional(),
  category: z.string().optional(),
  source: z.string().optional(),
  active_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const WebResearchRequestSchema = z.object({
  query: z.string(),
  url: z.string().url().optional(),
  domain: z.string().optional(),
  depth: z.enum(["quick", "thorough", "deep"]).optional(),
  sources: z.array(z.string()).optional(),
  max_results: z.number().int().min(1).max(100).optional(),
  options: z
    .object({
      use_real_fetching: z.boolean().optional(),
      skip_cache: z.boolean().optional(),
      timeout_ms: z.number().int().min(1000).max(60000).optional(),
    })
    .optional(),
});

// ============================================================================
// Experience Feedback System Types
// ============================================================================

export const ExperienceEventTypeSchema = z.enum([
  "click",
  "view",
  "conversion",
  "feedback",
]);

export type ExperienceEventType = z.infer<typeof ExperienceEventTypeSchema>;

export const ExperienceEventInputSchema = z.object({
  deal_code: z.string().min(1),
  event_type: ExperienceEventTypeSchema,
  agent_id: z.string().optional(),
  score: z.number().int().min(-100).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ExperienceEventInput = z.infer<typeof ExperienceEventInputSchema>;

export interface ExperienceEvent {
  id: string;
  deal_code: string;
  event_type: string;
  agent_id: string | null;
  score: number | null;
  metadata: string | null;
  created_at: number;
}

export interface ExperienceAggregate {
  deal_code: string;
  total_events: number;
  positive_events: number;
  negative_events: number;
  avg_score: number;
  last_updated: number;
}

// ============================================================================
// Auth / User Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
}
