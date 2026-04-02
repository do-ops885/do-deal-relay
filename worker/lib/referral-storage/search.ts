import { ReferralInput, ReferralResearchResult, Deal } from "../../types";
import type { Env } from "../../types";
import { REFERRAL_KEYS } from "./types";
import { getReferralById } from "./crud";

// ============================================================================
// Search and Query Operations
// ============================================================================

/**
 * Get all referrals for a domain
 */
export async function getReferralsByDomain(
  env: Env,
  domain: string,
): Promise<ReferralInput[]> {
  const indexKey = REFERRAL_KEYS.DOMAIN_INDEX;
  const index = await env.DEALS_SOURCES.get<Record<string, string[]>>(
    indexKey,
    "json",
  );

  if (!index || !index[domain]) return [];

  const referrals: ReferralInput[] = [];
  for (const id of index[domain]) {
    const referral = await getReferralById(env, id);
    if (referral) referrals.push(referral);
  }

  return referrals;
}

/**
 * Get referrals by status
 */
export async function getReferralsByStatus(
  env: Env,
  status: ReferralInput["status"],
): Promise<ReferralInput[]> {
  const listKey =
    status === "active"
      ? REFERRAL_KEYS.ACTIVE_LIST
      : REFERRAL_KEYS.INACTIVE_LIST;
  const ids = await env.DEALS_SOURCES.get<string[]>(listKey, "json");

  if (!ids) return [];

  const referrals: ReferralInput[] = [];
  for (const id of ids) {
    const referral = await getReferralById(env, id);
    if (referral && referral.status === status) {
      referrals.push(referral);
    }
  }

  return referrals;
}

/**
 * Search referrals with filters
 */
export async function searchReferrals(
  env: Env,
  filters: {
    domain?: string;
    status?: ReferralInput["status"] | "all";
    category?: string;
    source?: ReferralInput["source"] | "all";
    limit?: number;
    offset?: number;
  },
): Promise<{ referrals: ReferralInput[]; total: number }> {
  let referrals: ReferralInput[] = [];

  // Get base list
  if (filters.status && filters.status !== "all") {
    referrals = await getReferralsByStatus(env, filters.status);
  } else {
    // Get all - iterate through indices
    const active = await getReferralsByStatus(env, "active");
    const inactive = await getReferralsByStatus(env, "inactive");
    const expired = await getReferralsByStatus(env, "expired");
    const quarantined = await getReferralsByStatus(env, "quarantined");
    referrals = [...active, ...inactive, ...expired, ...quarantined];
  }

  // Apply filters
  if (filters.domain) {
    referrals = referrals.filter(
      (r) => r.domain.toLowerCase() === filters.domain!.toLowerCase(),
    );
  }

  if (filters.category) {
    referrals = referrals.filter((r: ReferralInput) =>
      r.metadata.category.some(
        (c: string) => c.toLowerCase() === filters.category!.toLowerCase(),
      ),
    );
  }

  if (filters.source && filters.source !== "all") {
    referrals = referrals.filter((r) => r.source === filters.source);
  }

  const total = referrals.length;

  // Apply pagination
  const offset = filters.offset || 0;
  const limit = filters.limit || 100;
  referrals = referrals.slice(offset, offset + limit);

  return { referrals, total };
}

/**
 * Store web research results
 */
export async function storeResearchResults(
  env: Env,
  domain: string,
  results: ReferralResearchResult,
): Promise<void> {
  const key = `${REFERRAL_KEYS.RESEARCH_PREFIX}${domain}:${Date.now()}`;
  await env.DEALS_SOURCES.put(key, JSON.stringify(results));

  // Store the latest research key for quick access
  const latestKey = `${REFERRAL_KEYS.RESEARCH_PREFIX}${domain}:latest`;
  await env.DEALS_SOURCES.put(latestKey, key);
}

/**
 * Get latest research results for a domain
 */
export async function getLatestResearch(
  env: Env,
  domain: string,
): Promise<ReferralResearchResult | null> {
  const latestKey = `${REFERRAL_KEYS.RESEARCH_PREFIX}${domain}:latest`;
  const researchKey = await env.DEALS_SOURCES.get<string>(latestKey);

  if (!researchKey) return null;

  return env.DEALS_SOURCES.get<ReferralResearchResult>(researchKey, "json");
}

/**
 * Convert referral input to Deal format
 */
export function referralToDeal(referral: ReferralInput): Omit<Deal, "id"> {
  const now = new Date().toISOString();

  return {
    source: {
      url: referral.url,
      domain: referral.domain,
      discovered_at: referral.submitted_at,
      trust_score: referral.metadata.confidence_score,
    },
    title: referral.metadata.title || `${referral.domain} Referral`,
    description:
      referral.metadata.description || `Referral code for ${referral.domain}`,
    code: referral.code,
    url: referral.url,
    reward: {
      type:
        referral.metadata.reward_type === "unknown"
          ? "cash"
          : referral.metadata.reward_type,
      value: referral.metadata.reward_value || 0,
      currency: referral.metadata.currency,
      description: referral.metadata.reward_value
        ? `${referral.metadata.reward_value} ${referral.metadata.currency || ""}`
        : undefined,
    },
    requirements: referral.metadata.requirements,
    expiry: {
      date: referral.expires_at,
      confidence: 0.5,
      type: referral.expires_at ? "soft" : "unknown",
    },
    metadata: {
      category:
        referral.metadata.category.length > 0
          ? referral.metadata.category
          : ["general"],
      tags: [...referral.metadata.tags, "referral", referral.domain],
      normalized_at: now,
      confidence_score: referral.metadata.confidence_score,
      status: referral.status === "active" ? "active" : "quarantined",
    },
  };
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Get all active referrals as Deals for pipeline processing
 */
export async function getActiveReferralsAsDeals(env: Env): Promise<Deal[]> {
  const activeReferrals = await getReferralsByStatus(env, "active");
  const deals: Deal[] = [];

  for (const referral of activeReferrals) {
    const dealBase = referralToDeal(referral);
    // Generate deal ID from referral
    const dealId = `ref-${referral.domain}-${referral.code}-${Date.now()}`;
    deals.push({ ...dealBase, id: dealId } as Deal);
  }

  return deals;
}

/**
 * Bulk deactivate expired referrals
 */
export async function deactivateExpiredReferrals(env: Env): Promise<number> {
  const activeReferrals = await getReferralsByStatus(env, "active");
  const now = new Date();
  let deactivatedCount = 0;

  for (const referral of activeReferrals) {
    if (referral.expires_at && new Date(referral.expires_at) < now) {
      const { updateReferralStatus } = await import("./crud");
      await updateReferralStatus(env, referral.id, "expired", "expired");
      deactivatedCount++;
    }
  }

  return deactivatedCount;
}
