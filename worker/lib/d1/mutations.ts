/**
 * Insert/Update Queries
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createD1Client } from "./client";
import type { Deal, ReferralInput } from "../../types";

/**
 * Insert a new deal with conflict handling
 */
export async function insertDeal(
  db: D1Database,
  deal: Partial<Deal> & {
    deal_id: string;
    title: string;
    url: string;
    domain: string;
  },
): Promise<{ success: boolean; id?: number; error?: string }> {
  const client = createD1Client(db);

  const now = Math.floor(Date.now() / 1000);

  const result = await client.execute(
    `INSERT INTO deals (
      deal_id, title, description, code, url, domain, 
      source_url, source_trust_score,
      reward_type, reward_value, reward_currency, reward_description,
      category, tags, status, is_active,
      expiry_date, expiry_confidence, expiry_type,
      requirements, normalized_at, confidence_score, raw_data,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, json(?), json(?), ?, ?, ?, ?, ?, json(?), ?, ?, ?, ?, ?)
    ON CONFLICT(deal_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      code = excluded.code,
      url = excluded.url,
      reward_type = excluded.reward_type,
      reward_value = excluded.reward_value,
      reward_currency = excluded.reward_currency,
      reward_description = excluded.reward_description,
      category = excluded.category,
      tags = excluded.tags,
      status = excluded.status,
      is_active = excluded.is_active,
      expiry_date = excluded.expiry_date,
      expiry_confidence = excluded.expiry_confidence,
      expiry_type = excluded.expiry_type,
      requirements = excluded.requirements,
      normalized_at = excluded.normalized_at,
      confidence_score = excluded.confidence_score,
      raw_data = excluded.raw_data,
      updated_at = excluded.updated_at`,
    [
      deal.deal_id,
      deal.title,
      deal.description || null,
      deal.code || null,
      deal.url,
      deal.domain,
      deal.source?.url || null,
      deal.source?.trust_score || 0.5,
      deal.reward?.type || null,
      typeof deal.reward?.value === "number" ? deal.reward.value : null,
      deal.reward?.currency || "USD",
      deal.reward?.description || null,
      JSON.stringify(deal.metadata?.category || []),
      JSON.stringify(deal.metadata?.tags || []),
      deal.metadata?.status || "active",
      deal.metadata?.status === "active" ? 1 : 0,
      deal.expiry?.date || null,
      deal.expiry?.confidence || 0.5,
      deal.expiry?.type || "unknown",
      JSON.stringify(deal.requirements || []),
      deal.metadata?.normalized_at || new Date().toISOString(),
      deal.metadata?.confidence_score || 0.5,
      JSON.stringify(deal),
      now,
      now,
    ],
  );

  if (result.success) {
    return {
      success: true,
      id: result.lastRowId,
    };
  }

  return {
    success: false,
    error: result.error || "Insert failed",
  };
}

/**
 * Insert a referral code
 */
export async function insertReferralCode(
  db: D1Database,
  referral: ReferralInput & { deal_id: number },
): Promise<{ success: boolean; id?: number; error?: string }> {
  const client = createD1Client(db);

  const now = Math.floor(Date.now() / 1000);

  const result = await client.execute(
    `INSERT INTO referral_codes (
      code, deal_id, user_id, submitted_by,
      max_uses, current_uses, use_count,
      status, is_active,
      expires_at,
      title, description, reward_type, reward_value,
      metadata,
      submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, json(?), ?)
    ON CONFLICT(code) DO UPDATE SET
      deal_id = excluded.deal_id,
      status = excluded.status,
      is_active = excluded.is_active,
      max_uses = excluded.max_uses,
      expires_at = excluded.expires_at,
      metadata = excluded.metadata,
      updated_at = strftime('%s', 'now')`,
    [
      referral.code,
      referral.deal_id,
      referral.submitted_by || null,
      referral.submitted_by || null,
      null, // max_uses
      0, // current_uses
      0, // use_count
      referral.status || "active",
      referral.status === "active" ? 1 : 0,
      referral.expires_at || null,
      referral.metadata?.title || null,
      referral.description || referral.metadata?.description || null,
      referral.metadata?.reward_type || null,
      referral.metadata?.reward_value?.toString() || null,
      JSON.stringify(referral.metadata || {}),
      referral.submitted_at
        ? Math.floor(new Date(referral.submitted_at).getTime() / 1000)
        : now,
    ],
  );

  if (result.success) {
    return {
      success: true,
      id: result.lastRowId,
    };
  }

  return {
    success: false,
    error: result.error || "Insert failed",
  };
}
