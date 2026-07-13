// ============================================================================
// DealRegistry Durable Object — Atomic Deal Staging & Publishing
// ============================================================================
// Manages deal lifecycle via DO + SQLite for strong consistency.
// Replaces KV-based deal staging with atomic operations, eliminating
// race conditions between concurrent pipeline runs.
//
// See: plans/ADR-017-durable-objects-migration.md (Phase 2)
// ============================================================================

import type { DurableObjectState } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

/** Deal status in the registry lifecycle. */
export type DealStatus = "candidate" | "validated" | "published" | "rejected";

/** Deal record stored in the registry. */
export interface DealRecord {
  deal_id: string;
  source: string;
  title: string;
  status: DealStatus;
  data: string;
  created_at: number;
  updated_at: number;
}

/** Row shape stored in the deals table. */
interface DealRow extends Record<string, string | number | null> {
  deal_id: string;
  source: string;
  title: string;
  status: string;
  data: string;
  created_at: number;
  updated_at: number;
}

/** Input for staging new deals. */
export interface StageDealInput {
  id: string;
  source: string;
  title: string;
  data: string;
}

/** Summary returned after a bulk operation. */
export interface BulkResult {
  processed: number;
  affected: number;
}

// ============================================================================
// DealRegistry Durable Object
// ============================================================================

/**
 * Globally-unique, single-threaded Durable Object providing atomic
 * deal staging and publishing via SQLite storage.
 *
 * Usage (RPC from Worker):
 *   const stub = env.DEAL_REGISTRY.getByName("deals");
 *   await stub.stageDeals([{ id, source, title, data }]);
 *   await stub.publishDeals(["deal-1", "deal-2"]);
 *   const candidates = await stub.getCandidatesBySource("trading212");
 */
export class DealRegistry {
  private readonly sql: DurableObjectState["storage"]["sql"];

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;

    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS deals (
        deal_id   TEXT PRIMARY KEY,
        source    TEXT NOT NULL,
        title     TEXT NOT NULL,
        status    TEXT DEFAULT 'candidate',
        data      TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    );

    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status)`,
    );

    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_deals_source ON deals(source)`,
    );
  }

  // --------------------------------------------------------------------------
  // stageDeals
  // --------------------------------------------------------------------------

  /**
   * Atomically stage new deals as candidates.
   *
   * Uses INSERT OR REPLACE to handle re-staging of the same deal ID
   * (e.g., re-discovery after expiry). Existing deals with the same ID
   * will have their data and timestamps updated.
   *
   * @param deals - Array of deal inputs to stage.
   * @returns     - Number of deals processed.
   */
  async stageDeals(deals: StageDealInput[]): Promise<number> {
    if (deals.length === 0) return 0;

    const now = Date.now();

    for (const d of deals) {
      this.sql.exec(
        `INSERT INTO deals (deal_id, source, title, status, data, created_at, updated_at)
         VALUES (?, ?, ?, 'candidate', ?, ?, ?)
         ON CONFLICT(deal_id) DO UPDATE SET
           source = excluded.source,
           title = excluded.title,
           data = excluded.data,
           updated_at = excluded.updated_at`,
        d.id,
        d.source,
        d.title,
        d.data,
        now,
        now,
      );
    }

    return deals.length;
  }

  // --------------------------------------------------------------------------
  // publishDeals
  // --------------------------------------------------------------------------

  /**
   * Atomically publish validated deals.
   *
   * Only deals currently in 'validated' status are transitioned to
   * 'published'. Deals in other statuses are skipped.
   *
   * @param dealIds - Array of deal IDs to publish.
   * @returns       - Number of deals actually published.
   */
  async publishDeals(dealIds: string[]): Promise<number> {
    if (dealIds.length === 0) return 0;

    const now = Date.now();
    let affected = 0;

    for (const id of dealIds) {
      this.sql.exec(
        `UPDATE deals
         SET status = 'published', updated_at = ?
         WHERE deal_id = ? AND status = 'validated'`,
        now,
        id,
      );

      const changes = this.sql.exec(`SELECT changes() as cnt`).one();
      if (Number(changes.cnt) > 0) affected++;
    }

    return affected;
  }

  // --------------------------------------------------------------------------
  // rejectDeals
  // --------------------------------------------------------------------------

  /**
   * Reject deals that failed validation.
   *
   * @param dealIds - Array of deal IDs to reject.
   * @returns       - Number of deals rejected.
   */
  async rejectDeals(dealIds: string[]): Promise<number> {
    if (dealIds.length === 0) return 0;

    const now = Date.now();
    let affected = 0;

    for (const id of dealIds) {
      this.sql.exec(
        `UPDATE deals
         SET status = 'rejected', updated_at = ?
         WHERE deal_id = ? AND status IN ('candidate', 'validated')`,
        now,
        id,
      );

      const changes = this.sql.exec(`SELECT changes() as cnt`).one();
      if (Number(changes.cnt) > 0) affected++;
    }

    return affected;
  }

  // --------------------------------------------------------------------------
  // validateDeals
  // --------------------------------------------------------------------------

  /**
   * Mark candidate deals as validated (passed all gates).
   *
   * @param dealIds - Array of deal IDs to validate.
   * @returns       - Number of deals validated.
   */
  async validateDeals(dealIds: string[]): Promise<number> {
    if (dealIds.length === 0) return 0;

    const now = Date.now();
    let affected = 0;

    for (const id of dealIds) {
      this.sql.exec(
        `UPDATE deals
         SET status = 'validated', updated_at = ?
         WHERE deal_id = ? AND status = 'candidate'`,
        now,
        id,
      );

      const changes = this.sql.exec(`SELECT changes() as cnt`).one();
      if (Number(changes.cnt) > 0) affected++;
    }

    return affected;
  }

  // --------------------------------------------------------------------------
  // getCandidatesBySource
  // --------------------------------------------------------------------------

  /**
   * Get all candidate deals for a given source.
   *
   * Used by the pipeline to check existing candidates before
   * re-staging from discovery.
   *
   * @param source - Source identifier to filter by.
   * @returns      - Array of matching deal records.
   */
  async getCandidatesBySource(source: string): Promise<DealRecord[]> {
    const rows = this.sql
      .exec<DealRow>(
        `SELECT deal_id, source, title, status, data, created_at, updated_at
         FROM deals WHERE source = ? AND status = 'candidate'
         ORDER BY created_at DESC`,
        source,
      )
      .toArray();

    return rows.map((row) => this.rowToDealRecord(row));
  }

  // --------------------------------------------------------------------------
  // getDealsByStatus
  // --------------------------------------------------------------------------

  /**
   * Get deals filtered by status with optional limit.
   *
   * @param status - Deal status to filter by.
   * @param limit  - Maximum number of results (default 100).
   * @returns      - Array of matching deal records.
   */
  async getDealsByStatus(
    status: DealStatus,
    limit: number = 100,
  ): Promise<DealRecord[]> {
    const rows = this.sql
      .exec<DealRow>(
        `SELECT deal_id, source, title, status, data, created_at, updated_at
         FROM deals WHERE status = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
        status,
        limit,
      )
      .toArray();

    return rows.map((row) => this.rowToDealRecord(row));
  }

  // --------------------------------------------------------------------------
  // getDeal
  // --------------------------------------------------------------------------

  /**
   * Get a single deal by ID.
   *
   * @param dealId - Deal identifier.
   * @returns      - Deal record, or null if not found.
   */
  async getDeal(dealId: string): Promise<DealRecord | null> {
    const rows = this.sql
      .exec<DealRow>(
        `SELECT deal_id, source, title, status, data, created_at, updated_at
         FROM deals WHERE deal_id = ?`,
        dealId,
      )
      .toArray();

    const first = rows[0];
    if (!first) return null;

    return this.rowToDealRecord(first);
  }

  // --------------------------------------------------------------------------
  // getStats
  // --------------------------------------------------------------------------

  /**
   * Get aggregate counts by status.
   *
   * @returns - Object with counts per status.
   */
  async getStats(): Promise<Record<DealStatus | "total", number>> {
    const rows = this.sql
      .exec<{ status: string; cnt: number }>(
        `SELECT status, COUNT(*) as cnt FROM deals GROUP BY status`,
      )
      .toArray();

    let total = 0;
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      const cnt = Number(row.cnt);
      byStatus[row.status] = cnt;
      total += cnt;
    }

    return { ...byStatus, total } as Record<DealStatus | "total", number>;
  }

  // --------------------------------------------------------------------------
  // purgeOld
  // --------------------------------------------------------------------------

  /**
   * Remove deals older than a given age (in milliseconds).
   *
   * Used by scheduled cleanup to prevent unbounded storage growth.
   *
   * @param maxAgeMs - Maximum age in milliseconds.
   * @returns        - Number of deals purged.
   */
  async purgeOld(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;

    this.sql.exec(
      `DELETE FROM deals WHERE updated_at < ? AND status IN ('published', 'rejected')`,
      cutoff,
    );

    const row = this.sql.exec(`SELECT changes() as cnt`).one();
    return Number(row.cnt);
  }

  // --------------------------------------------------------------------------
  // fetch (required for Durable Object class)
  // --------------------------------------------------------------------------

  /**
   * Durable Object fetch handler — required by the runtime.
   * All deal logic lives in the RPC methods above; this is a minimal
   * fallback for HTTP-style invocations.
   */
  async fetch(): Promise<Response> {
    return new Response("DealRegistry DO — use RPC methods", { status: 200 });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Convert a SQLite row into a typed DealRecord object.
   *
   * @param row - Raw row from the deals table.
   * @returns   - Typed DealRecord.
   */
  private rowToDealRecord(row: DealRow): DealRecord {
    return {
      deal_id: String(row.deal_id),
      source: String(row.source),
      title: String(row.title),
      status: String(row.status) as DealStatus,
      data: String(row.data),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
    };
  }
}
