import { ReferralInput } from "../../types";
import type { Env } from "../../types";
import {
  REFERRAL_KEYS,
  updateReferralIndices,
  updateStatusLists,
  logReferralChange,
} from "./types";

// ============================================================================
// Referral Input Storage - CRUD Operations
// ============================================================================

/**
 * Store a new referral input
 */
export async function storeReferralInput(
  env: Env,
  referral: ReferralInput,
): Promise<ReferralInput> {
  const key = `${REFERRAL_KEYS.INPUT_PREFIX}${referral.id || "unknown"}`;

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
  const oldStatus = referral.status || "unknown";

  // Update referral
  referral.status = newStatus;

  if (newStatus === "inactive" || newStatus === "expired") {
    referral.deactivated_at = now;
    referral.deactivated_reason = reason;
    if (notes) {
      referral.metadata = referral.metadata || {};
      referral.metadata.notes = notes;
    }
  }

  // Store updated referral
  await storeReferralInput(env, referral);

  // Update status lists
  await updateStatusLists(env, id, oldStatus || "unknown", newStatus);

  // Log the change
  await logReferralChange(env, {
    referral_id: id,
    code: referral.code || "",
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
  await updateStatusLists(env, referral.id || "", "active", "inactive");

  // Log deactivation
  await logReferralChange(env, {
    referral_id: referral.id || "",
    code: referral.code || "",
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
  await updateStatusLists(env, referral.id || "", oldStatus || "unknown", "active");

  await logReferralChange(env, {
    referral_id: referral.id || "",
    code: referral.code || "",
    change_type: "reactivation",
    old_value: oldStatus || "unknown",
    new_value: "active",
    notes,
    timestamp: now,
  });

  return referral;
}
