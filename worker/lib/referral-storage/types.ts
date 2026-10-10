import { ReferralInput } from "../../types";
import type { Env } from "../../types";

// ============================================================================
// KV Keys for Referral Management
// ============================================================================

export const REFERRAL_KEYS = {
  INPUT_PREFIX: "referral:input:",
  CODE_INDEX: "referral:index:code",
  CODE_INDEX_PREFIX: "referral:index:code:",
  DOMAIN_INDEX: "referral:index:domain",
  DOMAIN_INDEX_PREFIX: "referral:index:domain:",
  STATUS_INDEX: "referral:index:status",
  STATUS_PREFIX: "referral:status:",
  RESEARCH_PREFIX: "referral:research:",
  HISTORY_PREFIX: "referral:history:",
  ACTIVE_LIST: "referral:active:list",
  INACTIVE_LIST: "referral:inactive:list",
} as const;

export type ReferralStorageKeys = typeof REFERRAL_KEYS;

// ============================================================================
// Index Management
// ============================================================================

export async function updateReferralIndices(
  env: Env,
  referral: ReferralInput,
  oldDomain?: string,
): Promise<void> {
  const referralId = referral.id || "unknown";

  // Update code index (per-key atomic record)
  if (referral.code) {
    const codeKey = `${REFERRAL_KEYS.CODE_INDEX_PREFIX}${referral.code.toLowerCase()}`;
    await env.DEALS_SOURCES.put(codeKey, referralId);
  }

  // Update domain index (per-key atomic record per referral)
  const domain = (referral.domain || "unknown").toLowerCase();
  if (oldDomain) {
    const oldDomainLower = oldDomain.toLowerCase();
    if (oldDomainLower !== domain) {
      const oldDomainKey = `${REFERRAL_KEYS.DOMAIN_INDEX_PREFIX}${oldDomainLower}:${referralId}`;
      await env.DEALS_SOURCES.delete(oldDomainKey);
    }
  }

  const domainKey = `${REFERRAL_KEYS.DOMAIN_INDEX_PREFIX}${domain}:${referralId}`;
  await env.DEALS_SOURCES.put(domainKey, referralId);
}

export async function updateStatusLists(
  env: Env,
  id: string,
  oldStatus: ReferralInput["status"],
  newStatus: ReferralInput["status"],
): Promise<void> {
  // Remove from old status list
  if (oldStatus && oldStatus !== newStatus) {
    const oldKey = `${REFERRAL_KEYS.STATUS_PREFIX}${oldStatus}:${id}`;
    await env.DEALS_SOURCES.delete(oldKey);
  }

  // Add to new status list
  if (newStatus) {
    const newKey = `${REFERRAL_KEYS.STATUS_PREFIX}${newStatus}:${id}`;
    await env.DEALS_SOURCES.put(newKey, id);
  }
}

export async function logReferralChange(
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
