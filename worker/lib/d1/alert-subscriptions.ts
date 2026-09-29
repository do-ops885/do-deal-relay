import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";

export type AlertChannel = "telegram" | "discord" | "email" | "webhook";
export type AlertFrequency = "instant" | "daily-digest";

export interface AlertSubscriptionRow {
  id: string;
  user_id: string;
  saved_query_id: string;
  channel: AlertChannel;
  destination: string;
  threshold: number;
  frequency: AlertFrequency;
  active: number; // 1 or 0
  created_at: number;
  updated_at: number;
  query?: string; // joined query string when available
}

export interface CreateAlertSubscriptionInput {
  userId: string;
  savedQueryId: string;
  channel: AlertChannel;
  destination: string;
  threshold?: number;
  frequency?: AlertFrequency;
}

export interface UpdateAlertSubscriptionInput {
  threshold?: number;
  frequency?: AlertFrequency;
  active?: boolean;
  destination?: string;
}

const MAX_ALERTS_PER_USER = 20;

export async function createAlertSubscription(
  db: D1Database,
  input: CreateAlertSubscriptionInput,
): Promise<AlertSubscriptionRow> {
  const client = createD1ReadClient(db);
  const id = `sub_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const threshold = Math.min(Math.max(input.threshold ?? 0.7, 0), 1);
  const frequency = input.frequency || "instant";

  // Check saved query existence
  const queryRow = await client.queryFirst<{ id: string }>(
    `SELECT id FROM nlq_saved_queries WHERE id = ? AND user_id = ?`,
    [input.savedQueryId, input.userId],
  );
  if (!queryRow.success || !queryRow.data) {
    throw new Error("Saved query not found or does not belong to user");
  }

  // Enforce per-user limit
  const countRes = await client.queryFirst<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM alert_subscriptions WHERE user_id = ?`,
    [input.userId],
  );
  const cnt = countRes.success && countRes.data ? countRes.data.cnt : 0;
  if (cnt >= MAX_ALERTS_PER_USER) {
    throw new Error(`Maximum alert limit of ${MAX_ALERTS_PER_USER} reached`);
  }

  await db
    .prepare(
      `INSERT INTO alert_subscriptions
       (id, user_id, saved_query_id, channel, destination, threshold, frequency, active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, strftime('%s','now'), strftime('%s','now'))`,
    )
    .bind(
      id,
      input.userId,
      input.savedQueryId,
      input.channel,
      input.destination,
      threshold,
      frequency,
    )
    .run();

  const row = await client.queryFirst<AlertSubscriptionRow>(
    `SELECT a.id, a.user_id, a.saved_query_id, a.channel, a.destination, a.threshold, a.frequency, a.active, a.created_at, a.updated_at, q.query
     FROM alert_subscriptions a
     LEFT JOIN nlq_saved_queries q ON a.saved_query_id = q.id
     WHERE a.id = ?`,
    [id],
  );
  if (!row.success || !row.data)
    throw new Error("Failed to create alert subscription");
  return row.data;
}

export async function listAlertSubscriptions(
  db: D1Database,
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ rows: AlertSubscriptionRow[]; total: number }> {
  const client = createD1ReadClient(db);
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);

  const countRes = await client.queryFirst<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM alert_subscriptions WHERE user_id = ?`,
    [userId],
  );
  const total = countRes.success && countRes.data ? countRes.data.cnt : 0;

  const res = await client.query<AlertSubscriptionRow>(
    `SELECT a.id, a.user_id, a.saved_query_id, a.channel, a.destination, a.threshold, a.frequency, a.active, a.created_at, a.updated_at, q.query
     FROM alert_subscriptions a
     LEFT JOIN nlq_saved_queries q ON a.saved_query_id = q.id
     WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [userId, safeLimit, safeOffset],
  );
  return { rows: res.success ? res.data || [] : [], total };
}

export async function getAlertSubscription(
  db: D1Database,
  userId: string,
  id: string,
): Promise<AlertSubscriptionRow | null> {
  const client = createD1ReadClient(db);
  const res = await client.queryFirst<AlertSubscriptionRow>(
    `SELECT a.id, a.user_id, a.saved_query_id, a.channel, a.destination, a.threshold, a.frequency, a.active, a.created_at, a.updated_at, q.query
     FROM alert_subscriptions a
     LEFT JOIN nlq_saved_queries q ON a.saved_query_id = q.id
     WHERE a.id = ? AND a.user_id = ?`,
    [id, userId],
  );
  return res.success ? res.data || null : null;
}

export async function updateAlertSubscription(
  db: D1Database,
  userId: string,
  id: string,
  input: UpdateAlertSubscriptionInput,
): Promise<AlertSubscriptionRow | null> {
  const existing = await getAlertSubscription(db, userId, id);
  if (!existing) return null;

  const threshold =
    input.threshold !== undefined
      ? Math.min(Math.max(input.threshold, 0), 1)
      : existing.threshold;
  const frequency = input.frequency || existing.frequency;
  const active =
    input.active !== undefined ? (input.active ? 1 : 0) : existing.active;
  const destination = input.destination || existing.destination;

  await db
    .prepare(
      `UPDATE alert_subscriptions
       SET threshold = ?1, frequency = ?2, active = ?3, destination = ?4, updated_at = strftime('%s','now')
       WHERE id = ?5 AND user_id = ?6`,
    )
    .bind(threshold, frequency, active, destination, id, userId)
    .run();

  return getAlertSubscription(db, userId, id);
}

export async function deleteAlertSubscription(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM alert_subscriptions WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes || 0) > 0;
}

export async function getActiveSubscriptionsByFrequency(
  db: D1Database,
  frequency: AlertFrequency,
): Promise<AlertSubscriptionRow[]> {
  const client = createD1ReadClient(db);
  const res = await client.query<AlertSubscriptionRow>(
    `SELECT a.id, a.user_id, a.saved_query_id, a.channel, a.destination, a.threshold, a.frequency, a.active, a.created_at, a.updated_at, q.query
     FROM alert_subscriptions a
     INNER JOIN nlq_saved_queries q ON a.saved_query_id = q.id
     WHERE a.active = 1 AND a.frequency = ?`,
    [frequency],
  );
  return res.success ? res.data || [] : [];
}
