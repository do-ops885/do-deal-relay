import type { D1Database } from "@cloudflare/workers-types";
import { generateUUID } from "../crypto";

/** Outcome vocabulary for user-reported deal feedback (ADR-033). */
export type DealFeedbackOutcome = "success" | "expired" | "invalid";

export interface RecordDealFeedbackInput {
  userId: string;
  referralCode: string;
  outcome: DealFeedbackOutcome;
  sourceChannel?: string;
  comment?: string;
}

export interface DealFeedbackStats {
  total: number;
  success: number;
  expired: number;
  invalid: number;
  /** success / total; 0 when no feedback exists yet. */
  successRatio: number;
}

/**
 * Record or revise deal feedback. Upsert on (user_id, referral_code): the
 * first report inserts, later reports update the outcome so users can
 * correct a stale impression.
 * @returns true when a new row was inserted, false when an existing report
 *          was updated.
 */
export async function recordDealFeedback(
  db: D1Database,
  input: RecordDealFeedbackInput,
): Promise<boolean> {
  const id = generateUUID();
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `INSERT INTO deal_feedback
         (id, user_id, referral_code, outcome, source_channel, comment, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT(user_id, referral_code)
       DO UPDATE SET
         outcome = excluded.outcome,
         source_channel = excluded.source_channel,
         comment = excluded.comment,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      input.userId,
      input.referralCode,
      input.outcome,
      input.sourceChannel || "api",
      input.comment || null,
      now,
    )
    .run();
  // meta.changes: 1 = insert, 2 = SQLite reports an UPDATE through upsert.
  const changes = result.meta?.changes || 0;
  return changes === 1;
}

/**
 * Aggregate feedback outcomes for one referral code.
 * @returns Counts per outcome plus the success ratio (0 when no data).
 */
export async function getDealFeedbackStats(
  db: D1Database,
  referralCode: string,
): Promise<DealFeedbackStats> {
  const result = await db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as success,
         SUM(CASE WHEN outcome = 'expired' THEN 1 ELSE 0 END) as expired,
         SUM(CASE WHEN outcome = 'invalid' THEN 1 ELSE 0 END) as invalid
       FROM deal_feedback
       WHERE referral_code = ?1`,
    )
    .bind(referralCode)
    .first<{
      total: number;
      success: number | null;
      expired: number | null;
      invalid: number | null;
    }>();

  const total = result?.total || 0;
  const success = result?.success || 0;
  return {
    total,
    success,
    expired: result?.expired || 0,
    invalid: result?.invalid || 0,
    successRatio: total > 0 ? success / total : 0,
  };
}
