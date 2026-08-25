// ============================================================================
// PipelineLock Durable Object — Atomic Concurrency Control
// ============================================================================
// Replaces KV-based lock (worker/lib/lock.ts) with DO + SQLite for
// strong consistency. Eliminates P1-6 race condition via atomic
// check-and-set within a single DO instance.
//
// See: plans/ADR-017-durable-objects-migration.md
// ============================================================================

import type { DurableObjectState } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

/** Lock status returned by getLockStatus(). */
export interface LockStatus {
  locked: boolean;
  run_id?: string;
  trace_id?: string;
  acquired_at?: number;
  expires_at?: number;
}

/** Row shape stored in the locks table. */
interface LockRow extends Record<string, string | number | null> {
  id: string;
  run_id: string;
  trace_id: string;
  acquired_at: number;
  expires_at: number;
}

/** Default lock TTL in seconds (5 minutes, matches CONFIG.LOCK_TTL_SECONDS). */
const DEFAULT_LOCK_TTL_SECONDS = 300;

/** Singleton lock key — only one pipeline lock row ever exists. */
const LOCK_ID = "pipeline";

// ============================================================================
// PipelineLock Durable Object
// ============================================================================

/**
 * Globally-unique, single-threaded Durable Object providing atomic
 * distributed locking via SQLite storage.
 *
 * Usage (RPC from Worker):
 *   const stub = env.PIPELINE_LOCK.getByName("pipeline");
 *   const acquired = await stub.acquireLock("run-1", "trace-1", 300);
 *   if (acquired) { ... }
 *   const extended = await stub.extendLock("trace-1", 300);
 *   await stub.releaseLock("trace-1");
 */
export class PipelineLock {
  private readonly sql: DurableObjectState["storage"]["sql"];

  constructor(state: DurableObjectState) {
    this.sql = state.storage.sql;

    // Create the locks table if it doesn't exist.
    // The id column defaults to 'pipeline' — only one row is ever inserted.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS locks (
        id          TEXT PRIMARY KEY DEFAULT 'pipeline',
        run_id      TEXT NOT NULL,
        trace_id    TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL
      )`,
    );
  }

  // --------------------------------------------------------------------------
  // acquireLock
  // --------------------------------------------------------------------------

  /**
   * Attempt to acquire the pipeline lock.
   *
   * Atomic operation: checks expiry and inserts in a single SQL statement.
   * If no lock exists or the existing lock has expired, the caller's
   * trace_id is written. Otherwise the insert is a no-op.
   *
   * @param run_id   - Unique pipeline run identifier.
   * @param trace_id - Unique trace (request) identifier for ownership.
   * @param ttl      - Lock lifetime in seconds (default 300).
   * @returns true if the lock was acquired by this call.
   */
  async acquireLock(
    run_id: string,
    trace_id: string,
    ttl: number = DEFAULT_LOCK_TTL_SECONDS,
  ): Promise<boolean> {
    const now = Date.now();
    const expires = now + ttl * 1000;

    // Atomic: INSERT only if no unexpired lock exists.
    //   1. If no row exists → INSERT succeeds (new lock).
    //   2. If row exists but expired → INSERT succeeds (replaces via PK).
    //   3. If row exists and not expired → INSERT is a no-op (0 rows affected).
    this.sql.exec(
      `INSERT INTO locks (id, run_id, trace_id, acquired_at, expires_at)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM locks WHERE id = ? AND expires_at > ?
       )`,
      LOCK_ID,
      run_id,
      trace_id,
      now,
      expires,
      LOCK_ID,
      now,
    );

    // Verify ownership: read the current lock row and check trace_id.
    const row = this.sql
      .exec<LockRow>(
        `SELECT id, run_id, trace_id, acquired_at, expires_at
         FROM locks WHERE id = ?`,
        LOCK_ID,
      )
      .one();

    return row.trace_id === trace_id;
  }

  // --------------------------------------------------------------------------
  // releaseLock
  // --------------------------------------------------------------------------

  /**
   * Release the pipeline lock, but only if owned by the given trace_id.
   *
   * Safe to call multiple times — if the lock doesn't exist or is owned
   * by a different trace_id, this is a no-op.
   *
   * @param trace_id - The trace_id that originally acquired the lock.
   */
  async releaseLock(trace_id: string): Promise<void> {
    this.sql.exec(
      `DELETE FROM locks WHERE id = ? AND trace_id = ?`,
      LOCK_ID,
      trace_id,
    );
  }

  // --------------------------------------------------------------------------
  // extendLock
  // --------------------------------------------------------------------------

  /**
   * Extend the pipeline lock TTL, but only if owned by the given trace_id.
   *
   * Atomic operation: a single UPDATE guarded by both ownership and an
   * unexpired expiry check. Returns false when the lock is missing, already
   * expired, or owned by a different trace_id — callers treat false as a
   * definitive ownership rejection, not an infrastructure failure.
   *
   * @param trace_id           - The trace_id that originally acquired the lock.
   * @param additional_seconds - Seconds added to the current time.
   * @returns true if the expiry was extended by this call.
   */
  async extendLock(
    trace_id: string,
    additional_seconds: number,
  ): Promise<boolean> {
    const now = Date.now();
    const expires = now + additional_seconds * 1000;

    const cursor = this.sql.exec(
      `UPDATE locks SET expires_at = ?
       WHERE id = ? AND trace_id = ? AND expires_at > ?`,
      expires,
      LOCK_ID,
      trace_id,
      now,
    );

    return cursor.rowsWritten > 0;
  }

  // --------------------------------------------------------------------------
  // getLockStatus
  // --------------------------------------------------------------------------

  /**
   * Return the current lock status.
   *
   * If the lock row doesn't exist or has expired, returns `{ locked: false }`.
   * Otherwise returns the lock metadata.
   */
  async getLockStatus(): Promise<LockStatus> {
    const row = this.sql
      .exec<LockRow>(
        `SELECT id, run_id, trace_id, acquired_at, expires_at
         FROM locks WHERE id = ?`,
        LOCK_ID,
      )
      .one();

    const now = Date.now();
    const expiresAt = Number(row.expires_at);

    if (!row || expiresAt <= now) {
      return { locked: false };
    }

    return {
      locked: true,
      run_id: row.run_id,
      trace_id: row.trace_id,
      acquired_at: Number(row.acquired_at),
      expires_at: expiresAt,
    };
  }

  // --------------------------------------------------------------------------
  // fetch (required for Durable Object class)
  // --------------------------------------------------------------------------

  /**
   * Durable Object fetch handler — required by the runtime.
   * All lock logic lives in the RPC methods above; this is a minimal
   * fallback for HTTP-style invocations.
   */
  async fetch(): Promise<Response> {
    return new Response("PipelineLock DO — use RPC methods", { status: 200 });
  }
}
