import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";

export type DeliveryStatus = "sent" | "failed" | "skipped";

export interface RecordDeliveryInput {
  alertId: string;
  subscriptionId: string;
  dealIds: string[];
  channel: string;
  status: DeliveryStatus;
  error?: string;
}

const MAX_DEAL_IDS_JSON_LENGTH = 10000;

/**
 * Serialize deal ids to a JSON array string bounded by
 * MAX_DEAL_IDS_JSON_LENGTH. Truncation removes whole elements so the
 * stored value is always valid JSON; it never slices the serialized
 * string mid-token.
 */
function toBoundedDealIdsJson(dealIds: string[]): string {
  let json = JSON.stringify(dealIds);
  let count = dealIds.length;
  while (json.length > MAX_DEAL_IDS_JSON_LENGTH && count > 0) {
    count -= 1;
    json = JSON.stringify(dealIds.slice(0, count));
  }
  return json;
}

/**
 * Idempotent delivery state transitions for the (alert_id, subscription_id)
 * primary key.
 *
 * - First write inserts the row.
 * - A failed retry followed by a successful retry updates the same row to
 *   `sent` and clears the stale error. This is what lets a redelivered
 *   message be recognised as already delivered.
 * - `sent` is terminal: a late/ambiguous failure can never downgrade a
 *   successful delivery.
 * - `skipped` and `failed` remain overwriteable so retries can progress.
 * - `attempts` counts post-insert state changes (retries), preserving a
 *   bounded attempt history without a second table.
 *
 * Returns true when the row was inserted or its state changed.
 */
export async function recordDelivery(
  db: D1Database,
  input: RecordDeliveryInput,
): Promise<boolean> {
  const dealIdsJson = toBoundedDealIdsJson(input.dealIds);
  const result = await db
    .prepare(
      `INSERT INTO alert_deliveries
        (alert_id, subscription_id, deal_ids, channel, status, error, attempts, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, strftime('%s', 'now'))
       ON CONFLICT(alert_id, subscription_id) DO UPDATE SET
         deal_ids = CASE
           WHEN alert_deliveries.status = 'sent' THEN alert_deliveries.deal_ids
           ELSE excluded.deal_ids
         END,
         channel = CASE
           WHEN alert_deliveries.status = 'sent' THEN alert_deliveries.channel
           ELSE excluded.channel
         END,
         status = CASE
           WHEN alert_deliveries.status = 'sent' THEN 'sent'
           ELSE excluded.status
         END,
         error = CASE
           WHEN alert_deliveries.status = 'sent' THEN alert_deliveries.error
           ELSE excluded.error
         END,
         attempts = CASE
           WHEN alert_deliveries.status = 'sent' THEN alert_deliveries.attempts
           ELSE alert_deliveries.attempts + 1
         END,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.alertId,
      input.subscriptionId,
      dealIdsJson,
      input.channel,
      input.status,
      input.error || null,
    )
    .run();
  return (result.meta?.changes || 0) > 0;
}

/**
 * True only when a delivery was already recorded as `sent`.
 *
 * Failed attempts are deliberately excluded: a redelivered message whose
 * earlier attempt failed must be retried, not skipped. Skipping on any
 * row would silently swallow every retried send and the DLQ would never
 * be reached.
 */
export async function hasSentDelivery(
  db: D1Database,
  alertId: string,
  subscriptionId: string,
): Promise<boolean> {
  const client = createD1ReadClient(db);
  const res = await client.queryFirst<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM alert_deliveries
     WHERE alert_id = ? AND subscription_id = ? AND status = 'sent'`,
    [alertId, subscriptionId],
  );
  if (!res.success || !res.data) return false;
  return res.data.cnt > 0;
}

export async function hasDelivered(
  db: D1Database,
  alertId: string,
  subscriptionId: string,
): Promise<boolean> {
  const client = createD1ReadClient(db);
  const res = await client.queryFirst<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM alert_deliveries
     WHERE alert_id = ? AND subscription_id = ?`,
    [alertId, subscriptionId],
  );
  if (!res.success || !res.data) return false;
  return res.data.cnt > 0;
}
