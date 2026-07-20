/**
 * D1 Referrals Batch Helpers — Upsert referral records into the referrals table.
 *
 * Uses D1 batch API for atomic multi-row upserts (INSERT … ON CONFLICT DO UPDATE).
 * The referrals table stores discovered referral codes with their associated
 * domain, source, and reward metadata.
 */

import type { D1Database } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

export interface ReferralRecord {
  id: string;
  code: string;
  url: string;
  domain: string;
  source: string;
  title?: string;
  description?: string;
  rewardType?: string;
  rewardValue?: string;
  currency?: string;
  status?: string;
}

// ============================================================================
// SQL
// ============================================================================

const UPSERT_SQL = `INSERT INTO referrals (id, code, url, domain, source, title, description, reward_type, reward_value, currency, status, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    code = excluded.code, url = excluded.url, domain = excluded.domain,
    source = excluded.source, title = excluded.title, description = excluded.description,
    reward_type = excluded.reward_type, reward_value = excluded.reward_value,
    currency = excluded.currency, status = excluded.status`;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Batch-upsert referral records into the referrals table.
 * Empty arrays are a no-op.
 *
 * Uses INSERT … ON CONFLICT(id) DO UPDATE to handle duplicates gracefully —
 * existing rows are refreshed with the latest values from the incoming data.
 */
export async function insertReferralsBatch(
  db: D1Database,
  referrals: ReferralRecord[],
): Promise<void> {
  if (referrals.length === 0) return;

  const stmt = db.prepare(UPSERT_SQL);

  await db.batch(
    referrals.map((r) =>
      stmt.bind(
        r.id,
        r.code,
        r.url,
        r.domain,
        r.source,
        r.title ?? null,
        r.description ?? null,
        r.rewardType ?? null,
        r.rewardValue ?? null,
        r.currency ?? "USD",
        r.status ?? "quarantined",
      ),
    ),
  );
}
