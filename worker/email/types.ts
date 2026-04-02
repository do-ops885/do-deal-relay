import { z } from "zod";

// ============================================================================
// Email Handler Types
// ============================================================================

export const EmailCommandTypeSchema = z.enum([
  "ADD",
  "DEACTIVATE",
  "SEARCH",
  "DIGEST",
  "HELP",
  "FORWARDED",
  "UNKNOWN",
]);

export const ParsedEmailSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()),
  subject: z.string(),
  text: z.string().optional(),
  html: z.string().optional(),
  headers: z.record(z.string()).optional(),
  dkimValid: z.boolean().optional(),
  spfValid: z.boolean().optional(),
  spamScore: z.number().optional(),
});

export const ParsedCommandSchema = z.object({
  type: EmailCommandTypeSchema,
  service: z.string().optional(),
  code: z.string().optional(),
  referralUrl: z.string().url().optional(),
  expiry: z.string().datetime().optional(),
  reward: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional(),
  query: z.string().optional(),
  reason: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  notes: z.string().optional(),
});

export const ExtractionResultSchema = z.object({
  service: z.string(),
  code: z.string().nullable(),
  referralUrl: z.string().url().nullable(),
  reward: z.string().nullable(),
  expiry: z.string().datetime().nullable(),
  confidence: z.number().min(0).max(1),
  method: z.enum(["service-specific", "generic", "manual"]),
});

export const EmailProcessingResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  referralId: z.string().optional(),
  extracted: ExtractionResultSchema.optional(),
  confirmationSent: z.boolean(),
  error: z.string().optional(),
});

export type EmailCommandType = z.infer<typeof EmailCommandTypeSchema>;
export type ParsedEmail = z.infer<typeof ParsedEmailSchema>;
export type ParsedCommand = z.infer<typeof ParsedCommandSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type EmailProcessingResult = z.infer<typeof EmailProcessingResultSchema>;

// ============================================================================
// Service Pattern Types
// ============================================================================

export interface ServicePattern {
  sender: RegExp;
  subject: RegExp;
  code: {
    inUrl?: RegExp;
    inBody?: RegExp;
    inHtml?: RegExp;
  };
  urlPatterns: RegExp[];
  reward?: RegExp;
  expiry?: RegExp;
  serviceName: string;
  category: string;
  priority: number; // Higher = checked first
}

// ============================================================================
// Security Types
// ============================================================================

export interface SecurityResult {
  valid: boolean;
  reason?: string;
  spamScore?: number;
  dkimValid?: boolean;
  spfValid?: boolean;
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// ============================================================================
// Template Types
// ============================================================================

export interface ConfirmationEmailData {
  service: string;
  code?: string | null;
  referralUrl?: string | null;
  reward?: string | null;
  expiry?: string | null;
  confidence: number;
  source: string;
  action: "added" | "deactivated" | "found" | "error";
  errorMessage?: string;
  notes?: string;
  searchResults?: Array<{
    code: string;
    url: string;
    domain: string;
    status: string;
  }>;
}
