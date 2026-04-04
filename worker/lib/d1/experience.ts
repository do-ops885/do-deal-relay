import type { D1Database } from "@cloudflare/workers-types";
import { createD1Client, createD1ReadClient } from "./client";
import { CONFIG } from "../../config";
import type { ExperienceEvent, ExperienceAggregate } from "../../types";

export interface ExperienceEventResult {
  success: boolean;
  event?: ExperienceEvent;
  error?: string;
}

export interface ExperienceAggregateResult {
  success: boolean;
  aggregate?: ExperienceAggregate;
  error?: string;
}

export interface AggregationResult {
  success: boolean;
  dealsProcessed: number;
  eventsProcessed: number;
  error?: string;
}

export async function submitExperienceEvent(
  db: D1Database,
  event: {
    id: string;
    deal_code: string;
    event_type: string;
    agent_id?: string;
    score?: number;
    metadata?: string;
  },
): Promise<ExperienceEventResult> {
  const client = createD1Client(db);

  const result = await client.execute(
    `INSERT INTO experience_events (id, deal_code, event_type, agent_id, score, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.deal_code,
      event.event_type,
      event.agent_id || null,
      event.score !== undefined ? event.score : null,
      event.metadata || null,
      Math.floor(Date.now() / 1000),
    ],
  );

  if (result.success) {
    return {
      success: true,
      event: {
        id: event.id,
        deal_code: event.deal_code,
        event_type: event.event_type,
        agent_id: event.agent_id || null,
        score: event.score !== undefined ? event.score : null,
        metadata: event.metadata || null,
        created_at: Math.floor(Date.now() / 1000),
      },
    };
  }

  return { success: false, error: result.error || "Failed to insert event" };
}

export async function getExperienceAggregate(
  db: D1Database,
  dealCode: string,
): Promise<ExperienceAggregateResult> {
  const client = createD1ReadClient(db);

  const result = await client.queryFirst<ExperienceAggregate>(
    `SELECT deal_code, total_events, positive_events, negative_events, avg_score, last_updated
     FROM experience_aggregates
     WHERE deal_code = ?`,
    [dealCode],
  );

  if (result.success) {
    return { success: true, aggregate: result.data || undefined };
  }

  return { success: false, error: result.error || "Query failed" };
}

export async function runAggregation(
  db: D1Database,
): Promise<AggregationResult> {
  const client = createD1Client(db);
  const readClient = createD1ReadClient(db);

  const dealsResult = await readClient.query<{ deal_code: string }>(
    `SELECT DISTINCT deal_code FROM experience_events
     WHERE created_at >= ?`,
    [
      Math.floor(Date.now() / 1000) -
        CONFIG.EXPERIENCE_AGGREGATE_WINDOW_HOURS * 3600,
    ],
  );

  if (
    !dealsResult.success ||
    !dealsResult.data ||
    dealsResult.data.length === 0
  ) {
    return { success: true, dealsProcessed: 0, eventsProcessed: 0 };
  }

  let dealsProcessed = 0;
  let eventsProcessed = 0;

  for (const row of dealsResult.data) {
    const statsResult = await readClient.queryFirst<{
      total: number;
      positive: number;
      negative: number;
      avg: number;
    }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN score > 0 THEN 1 ELSE 0 END) as positive,
         SUM(CASE WHEN score < 0 THEN 1 ELSE 0 END) as negative,
         COALESCE(AVG(score), 0) as avg
       FROM experience_events
       WHERE deal_code = ?`,
      [row.deal_code],
    );

    if (!statsResult.success || !statsResult.data) continue;

    const stats = statsResult.data;
    const now = Math.floor(Date.now() / 1000);

    await client.execute(
      `INSERT INTO experience_aggregates (deal_code, total_events, positive_events, negative_events, avg_score, last_updated)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(deal_code) DO UPDATE SET
         total_events = excluded.total_events,
         positive_events = excluded.positive_events,
         negative_events = excluded.negative_events,
         avg_score = excluded.avg_score,
         last_updated = excluded.last_updated`,
      [
        row.deal_code,
        stats.total || 0,
        stats.positive || 0,
        stats.negative || 0,
        stats.avg || 0,
        now,
      ],
    );

    dealsProcessed++;
    eventsProcessed += stats.total || 0;
  }

  return { success: true, dealsProcessed, eventsProcessed };
}
