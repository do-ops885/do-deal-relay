import { ReferralInput } from "../../types";
import type { Env } from "../../types";

// ============================================================================
// KV Keys for Referral Management
// ============================================================================

export const REFERRAL_KEYS = {
  INPUT_PREFIX: "referral:input:",
  CODE_INDEX: "referral:index:code",
  DOMAIN_INDEX: "referral:index:domain",
  STATUS_INDEX: "referral:index:status",
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

export async function updateStatusLists(
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
  const filteredOldList = oldList.filter((itemId: string) => itemId !== id);
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
