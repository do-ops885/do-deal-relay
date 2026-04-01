import { ReferralInput, ReferralResearchResult, Deal } from "../types";
import type { Env } from "../types";
import { CONFIG } from "../config";

// ============================================================================
// KV Keys for Referral Management
// ============================================================================

const REFERRAL_KEYS = {
  INPUT_PREFIX: "referral:input:",
  CODE_INDEX: "referral:index:code",
  DOMAIN_INDEX: "referral:index:domain",
  STATUS_INDEX: "referral:index:status",
  RESEARCH_PREFIX: "referral:research:",
  HISTORY_PREFIX: "referral:history:",
  ACTIVE_LIST: "referral:active:list",
  INACTIVE_LIST: "referral:inactive:list",
} as const;

// ============================================================================
// Referral Input Storage
// ============================================================================

/**
 * Store a new referral input
 */
export async function storeReferralInput(
  env: Env,
  referral: ReferralInput,
): Promise<ReferralInput> {
  const key = `${REFERRAL_KEYS.INPUT_PREFIX}${referral.id}`;

  // Store the referral
  await env.DEALS_SOURCES.put(key, JSON.stringify(referral));

  // Update indices
  await updateReferralIndices(env, referral);

  return referral;
}

/**
 * Get a referral input by ID
 */
export async function getReferralById(
  env: Env,
  id: string,
): Promise<ReferralInput | null> {
  const key = `${REFERRAL_KEYS.INPUT_PREFIX}${id}`;
  const data = await env.DEALS_SOURCES.get<ReferralInput>(key, "json");
  return data;
}

/**
 * Get referral by code (case-insensitive)
 */
export async function getReferralByCode(
  env: Env,
  code: string,
): Promise<ReferralInput | null> {
  const indexKey = REFERRAL_KEYS.CODE_INDEX;
  const index = await env.DEALS_SOURCES.get<Record<string, string>>(
    indexKey,
    "json",
  );

  if (!index) return null;

  const id = index[code.toLowerCase()];
  if (!id) return null;

  return getReferralById(env, id);
}

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
 * Update referral status (activate/deactivate)
 */
export async function updateReferralStatus(
  env: Env,
  id: string,
  newStatus: ReferralInput["status"],
  reason?: ReferralInput["deactivated_reason"],
  notes?: string,
): Promise<ReferralInput | null> {
  const referral = await getReferralById(env, id);
  if (!referral) return null;

  const now = new Date().toISOString();
  const oldStatus = referral.status;

  // Update referral
  referral.status = newStatus;

  if (newStatus === "inactive" || newStatus === "expired") {
    referral.deactivated_at = now;
    referral.deactivated_reason = reason;
    if (notes) {
      referral.metadata.notes = notes;
    }
  }

  // Store updated referral
  await storeReferralInput(env, referral);

  // Update status lists
  await updateStatusLists(env, id, oldStatus, newStatus);

  // Log the change
  await logReferralChange(env, {
    referral_id: id,
    code: referral.code,
    change_type: "status_update",
    old_value: oldStatus,
    new_value: newStatus,
    reason,
    notes,
    timestamp: now,
  });

  return referral;
}

/**
 * Deactivate a referral code
 */
export async function deactivateReferral(
  env: Env,
  code: string,
  reason: ReferralInput["deactivated_reason"],
  replacedBy?: string,
  notes?: string,
): Promise<ReferralInput | null> {
  const referral = await getReferralByCode(env, code);
  if (!referral) return null;

  const now = new Date().toISOString();

  referral.status = "inactive";
  referral.deactivated_at = now;
  referral.deactivated_reason = reason;

  if (replacedBy) {
    referral.related_codes = [...(referral.related_codes || []), replacedBy];
  }

  await storeReferralInput(env, referral);
  await updateStatusLists(env, referral.id, "active", "inactive");

  // Log deactivation
  await logReferralChange(env, {
    referral_id: referral.id,
    code: referral.code,
    change_type: "deactivation",
    old_value: "active",
    new_value: "inactive",
    reason,
    notes,
    replaced_by: replacedBy,
    timestamp: now,
  });

  return referral;
}

/**
 * Reactivate a referral code
 */
export async function reactivateReferral(
  env: Env,
  code: string,
  notes?: string,
): Promise<ReferralInput | null> {
  const referral = await getReferralByCode(env, code);
  if (!referral) return null;

  const now = new Date().toISOString();
  const oldStatus = referral.status;

  referral.status = "active";
  referral.deactivated_at = undefined;
  referral.deactivated_reason = undefined;

  await storeReferralInput(env, referral);
  await updateStatusLists(env, referral.id, oldStatus, "active");

  await logReferralChange(env, {
    referral_id: referral.id,
    code: referral.code,
    change_type: "reactivation",
    old_value: oldStatus,
    new_value: "active",
    notes,
    timestamp: now,
  });

  return referral;
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
    referrals = referrals.filter((r) =>
      r.metadata.category.some(
        (c) => c.toLowerCase() === filters.category!.toLowerCase(),
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
// Index Management
// ============================================================================

async function updateReferralIndices(
  env: Env,
  referral: ReferralInput,
): Promise<void> {
  // Update code index
  const codeIndexKey = REFERRAL_KEYS.CODE_INDEX;
  const codeIndex =
    (await env.DEALS_SOURCES.get<Record<string, string>>(
      codeIndexKey,
      "json",
    )) || {};
  codeIndex[referral.code.toLowerCase()] = referral.id;
  await env.DEALS_SOURCES.put(codeIndexKey, JSON.stringify(codeIndex));

  // Update domain index
  const domainIndexKey = REFERRAL_KEYS.DOMAIN_INDEX;
  const domainIndex =
    (await env.DEALS_SOURCES.get<Record<string, string[]>>(
      domainIndexKey,
      "json",
    )) || {};
  if (!domainIndex[referral.domain]) {
    domainIndex[referral.domain] = [];
  }
  if (!domainIndex[referral.domain].includes(referral.id)) {
    domainIndex[referral.domain].push(referral.id);
  }
  await env.DEALS_SOURCES.put(domainIndexKey, JSON.stringify(domainIndex));
}

async function updateStatusLists(
  env: Env,
  id: string,
  oldStatus: ReferralInput["status"],
  newStatus: ReferralInput["status"],
): Promise<void> {
  // Remove from old list
  const oldListKey =
    oldStatus === "active"
      ? REFERRAL_KEYS.ACTIVE_LIST
      : REFERRAL_KEYS.INACTIVE_LIST;
  const oldList =
    (await env.DEALS_SOURCES.get<string[]>(oldListKey, "json")) || [];
  const filteredOldList = oldList.filter((itemId) => itemId !== id);
  await env.DEALS_SOURCES.put(oldListKey, JSON.stringify(filteredOldList));

  // Add to new list
  const newListKey =
    newStatus === "active"
      ? REFERRAL_KEYS.ACTIVE_LIST
      : REFERRAL_KEYS.INACTIVE_LIST;
  const newList =
    (await env.DEALS_SOURCES.get<string[]>(newListKey, "json")) || [];
  if (!newList.includes(id)) {
    newList.push(id);
  }
  await env.DEALS_SOURCES.put(newListKey, JSON.stringify(newList));
}

async function logReferralChange(
  env: Env,
  log: {
    referral_id: string;
    code: string;
    change_type: string;
    old_value?: string;
    new_value?: string;
    reason?: string;
    notes?: string;
    replaced_by?: string;
    timestamp: string;
  },
): Promise<void> {
  const key = `${REFERRAL_KEYS.HISTORY_PREFIX}${log.referral_id}:${Date.now()}`;
  await env.DEALS_SOURCES.put(key, JSON.stringify(log));
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
      await updateReferralStatus(env, referral.id, "expired", "expired");
      deactivatedCount++;
    }
  }

  return deactivatedCount;
}
