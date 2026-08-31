import type { D1Database } from "@cloudflare/workers-types";
import { createD1ReadClient } from "./client";

export interface SavedQueryRow {
  id: string;
  user_id: string;
  query: string;
  name: string | null;
  intent: string | null;
  created_at: number;
  updated_at: number;
}

export interface SaveQueryInput {
  userId: string;
  query: string;
  name?: string;
  intent?: string;
}

const MAX_SAVED_PER_USER = 50;

export async function saveQuery(
  db: D1Database,
  input: SaveQueryInput,
): Promise<SavedQueryRow> {
  const client = createD1ReadClient(db);
  const id = `nlq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const name = input.name?.slice(0, 100) || null;
  const intent = input.intent?.slice(0, 50) || null;
  const query = input.query.trim().slice(0, 500);

  // Enforce per-user cap
  const countRes = await client.queryFirst<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM nlq_saved_queries WHERE user_id = ?`,
    [input.userId],
  );
  const cnt = countRes.success && countRes.data ? countRes.data.cnt : 0;
  if (cnt >= MAX_SAVED_PER_USER) {
    // Evict oldest
    await db
      .prepare(
        `DELETE FROM nlq_saved_queries WHERE id = (SELECT id FROM nlq_saved_queries WHERE user_id = ? ORDER BY created_at ASC LIMIT 1)`,
      )
      .bind(input.userId)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO nlq_saved_queries (id, user_id, query, name, intent, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s','now'), strftime('%s','now'))`,
    )
    .bind(id, input.userId, query, name, intent)
    .run();

  const row = await client.queryFirst<SavedQueryRow>(
    `SELECT id, user_id, query, name, intent, created_at, updated_at FROM nlq_saved_queries WHERE id = ?`,
    [id],
  );
  if (!row.success || !row.data) throw new Error("Failed to save query");
  return row.data;
}

export async function listSavedQueries(
  db: D1Database,
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ rows: SavedQueryRow[]; total: number }> {
  const client = createD1ReadClient(db);
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);

  const countRes = await client.queryFirst<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM nlq_saved_queries WHERE user_id = ?`,
    [userId],
  );
  const total = countRes.success && countRes.data ? countRes.data.cnt : 0;

  const res = await client.query<SavedQueryRow>(
    `SELECT id, user_id, query, name, intent, created_at, updated_at
     FROM nlq_saved_queries WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, safeLimit, safeOffset],
  );
  return { rows: res.success ? res.data || [] : [], total };
}

export async function deleteSavedQuery(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM nlq_saved_queries WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes || 0) > 0;
}

export async function getSavedQuery(
  db: D1Database,
  userId: string,
  id: string,
): Promise<SavedQueryRow | null> {
  const client = createD1ReadClient(db);
  const res = await client.queryFirst<SavedQueryRow>(
    `SELECT id, user_id, query, name, intent, created_at, updated_at FROM nlq_saved_queries WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return res.success ? res.data || null : null;
}
