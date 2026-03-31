import { Deal, PipelineContext } from "../types";
import { generateDealId } from "../lib/crypto";

// ============================================================================
// Normalization Pipeline
// ============================================================================

/**
 * Normalize all deals to canonical format
 */
export function normalize(deals: Deal[], ctx: PipelineContext): Deal[] {
  return deals.map((deal) => normalizeDeal(deal));
}

/**
 * Normalize a single deal
 */
function normalizeDeal(deal: Deal): Deal {
  const now = new Date().toISOString();

  return {
    ...deal,
    // Normalize IDs
    id: deal.id, // Already hashed in discovery

    // Normalize source
    source: {
      ...deal.source,
      domain: deal.source.domain.toLowerCase().trim(),
      url: normalizeUrl(deal.source.url),
    },

    // Normalize text fields
    title: normalizeText(deal.title),
    description: normalizeText(deal.description),
    code: deal.code.toUpperCase().trim(), // Codes typically uppercase
    url: normalizeUrl(deal.url),

    // Normalize reward
    reward: {
      ...deal.reward,
      type: deal.reward.type,
      currency: deal.reward.currency?.toUpperCase(),
    },

    // Normalize requirements
    requirements: deal.requirements?.map(normalizeText),

    // Normalize expiry
    expiry: {
      ...deal.expiry,
      date: deal.expiry.date ? normalizeDate(deal.expiry.date) : undefined,
    },

    // Update metadata
    metadata: {
      ...deal.metadata,
      category: deal.metadata.category.map((c) => c.toLowerCase().trim()),
      tags: deal.metadata.tags.map((t) => t.toLowerCase().trim()),
      normalized_at: now,
    },
  };
}

/**
 * Normalize URL
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
      "ref",
      "referrer",
    ];

    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }

    // Sort remaining params for consistency
    const sortedParams = new URLSearchParams(
      [...parsed.searchParams].sort(([a], [b]) => a.localeCompare(b)),
    );
    parsed.search = sortedParams.toString();

    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Normalize text
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/[^\x20-\x7E]/g, "") // Remove non-printable
    .slice(0, 1000); // Max length
}

/**
 * Normalize date to ISO format
 */
function normalizeDate(date: string): string {
  try {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return date; // Keep original if invalid
    }
    return parsed.toISOString();
  } catch {
    return date;
  }
}

/**
 * Generate canonical ID from normalized deal
 */
export async function regenerateDealId(deal: Deal): Promise<string> {
  return generateDealId(deal.source.domain, deal.code, deal.reward.type);
}

/**
 * Verify normalization integrity
 */
export function verifyNormalization(deals: Deal[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  for (const deal of deals) {
    // Check for empty required fields
    if (!deal.code) issues.push(`Deal ${deal.id}: missing code`);
    if (!deal.url) issues.push(`Deal ${deal.id}: missing URL`);
    if (!deal.title) issues.push(`Deal ${deal.id}: missing title`);

    // Check URL format
    try {
      new URL(deal.url);
    } catch {
      issues.push(`Deal ${deal.id}: invalid URL ${deal.url}`);
    }

    // Check code format (alphanumeric, reasonable length)
    if (!/^[A-Z0-9_-]{4,50}$/.test(deal.code)) {
      issues.push(`Deal ${deal.id}: suspicious code format ${deal.code}`);
    }

    // Check domain is lowercase
    if (deal.source.domain !== deal.source.domain.toLowerCase()) {
      issues.push(`Deal ${deal.id}: domain not lowercase`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
