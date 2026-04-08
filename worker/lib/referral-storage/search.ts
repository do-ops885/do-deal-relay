import { ReferralInput, ReferralResearchResult, Deal } from "../../types";
import type { Env } from "../../types";
import { REFERRAL_KEYS } from "./types";
import { getReferralById } from "./crud";
import { fetchInBatches, executeInBatches } from "../utils";

// ============================================================================
// Search and Query Operations
// ============================================================================

/**
 * Get all referrals for a domain
 * Optimization: Parallel batch fetch instead of sequential loop
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

  return fetchInBatches(index[domain], (id) => getReferralById(env, id));
}

/**
 * Get referrals by status
 * Optimization: Parallel batch fetch instead of sequential loop
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

  // fetchInBatches automatically filters out null/undefined results
  const referrals = await fetchInBatches(ids, (id) => getReferralById(env, id));
  return referrals.filter((r) => r && r.status === status);
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
    // Get all - Optimization: Parallelize retrieval of all statuses
    const [active, inactive, expired, quarantined] = await Promise.all([
      getReferralsByStatus(env, "active"),
      getReferralsByStatus(env, "inactive"),
      getReferralsByStatus(env, "expired"),
      getReferralsByStatus(env, "quarantined"),
    ]);
    referrals = [...active, ...inactive, ...expired, ...quarantined];
  }

  // Apply filters
  if (filters.domain) {
    referrals = referrals.filter(
      (r) => (r.domain || "").toLowerCase() === filters.domain!.toLowerCase(),
    );
  }

  if (filters.category) {
    referrals = referrals.filter((r: ReferralInput) =>
      (r.metadata?.category || []).some(
        (c: string) => c.toLowerCase() === filters.category!.toLowerCase(),
      ),
    );
  }

  if (filters.source && filters.source !== "all") {
    referrals = referrals.filter((r) => (r.source || "") === filters.source);
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
  const metadata = referral.metadata || {};
  const domain = referral.domain || "unknown";

  return {
    source: {
      url: referral.url,
      domain: domain,
      discovered_at: referral.submitted_at || now,
      trust_score: metadata.confidence_score ?? 0.5,
    },
    title: metadata.title || `${domain} Referral`,
    description: metadata.description || `Referral code for ${domain}`,
    code: referral.code,
    url: referral.url,
    reward: {
      type:
        metadata.reward_type === "unknown" || !metadata.reward_type
          ? "cash"
          : (metadata.reward_type as "cash" | "credit" | "percent" | "item"),
      value: metadata.reward_value
        ? parseFloat(String(metadata.reward_value))
        : 0,
      currency: (metadata.currency as string | undefined) || "USD",
      description: metadata.reward_value
        ? `${metadata.reward_value} ${(metadata.currency as string | undefined) || ""}`
        : undefined,
    },
    requirements: metadata.requirements || [],
    expiry: {
      date: referral.expires_at,
      confidence: 0.5,
      type: referral.expires_at ? "soft" : "unknown",
    },
    metadata: {
      category:
        (metadata.category || []).length > 0
          ? (metadata.category as string[])
          : ["general"],
      tags: [...(metadata.tags || []), "referral", domain],
      normalized_at: now,
      confidence_score: metadata.confidence_score ?? 0.5,
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
    const dealId = `ref-${referral.domain || "unknown"}-${referral.code || "nocode"}-${Date.now()}`;
    deals.push({ ...dealBase, id: dealId } as Deal);
  }

  return deals;
}

/**
 * Bulk deactivate expired referrals
 * Optimization: Parallel batch execution instead of sequential loop
 */
export async function deactivateExpiredReferrals(env: Env): Promise<number> {
  const activeReferrals = await getReferralsByStatus(env, "active");
  const now = new Date();
  const expiredReferrals = activeReferrals.filter(
    (r) => r.expires_at && new Date(r.expires_at) < now,
  );

  if (expiredReferrals.length === 0) return 0;

  const { updateReferralStatus } = await import("./crud");

  const result = await executeInBatches(expiredReferrals, async (referral) => {
    if (referral.id) {
      await updateReferralStatus(env, referral.id, "expired", "expired");
    }
  });

  return result.success;
}
