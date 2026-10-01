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
 * Idempotency guard for queue redelivery. INSERT OR IGNORE on the
 * (alert_id, subscription_id) primary key: first insert returns true,
 * duplicates return false so the consumer skips resends.
 */
export async function recordDelivery(
  db: D1Database,
  input: RecordDeliveryInput,
): Promise<boolean> {
  const dealIdsJson = JSON.stringify(input.dealIds).slice(
    0,
    MAX_DEAL_IDS_JSON_LENGTH,
  );
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO alert_deliveries
        (alert_id, subscription_id, deal_ids, channel, status, error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
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
