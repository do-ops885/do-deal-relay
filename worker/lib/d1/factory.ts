/**
 * D1 Client Factory Functions & SQL Helpers
 *
 * Extracted from client.ts to keep file sizes under the 500-line limit.
 *
 * @module worker/lib/d1/factory
 */

import type { D1Database } from "@cloudflare/workers-types";
import { D1Client } from "./client";
import type { D1ClientConfig } from "./client";

// ============================================================================
// SQL Helpers
// ============================================================================

/**
 * Strip SQL single-line comment lines (-- ...) and blank lines from a SQL string.
 * Preserves inline comments (e.g. `SELECT 1 -- test` remains `SELECT 1`).
 * Preserves block comments (/* ... *​/).
 */
export function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("--");
    })
    .join("\n");
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a D1 client with default configuration
 */
export function createD1Client(
  db: D1Database,
  config?: D1ClientConfig,
): D1Client {
  return new D1Client(db, config);
}

/**
 * Create a D1 client optimized for reads (uses sessions for replication)
 */
export function createD1ReadClient(
  db: D1Database,
  bookmark?: string,
): D1Client {
  return new D1Client(db, {
    useSessions: true,
    sessionBookmark: bookmark || "first-unconstrained",
    enableRetries: true,
  });
}

/**
 * Create a D1 client optimized for writes
 */
export function createD1WriteClient(db: D1Database): D1Client {
  return new D1Client(db, {
    useSessions: true,
    sessionBookmark: "first-primary", // Forces primary for immediate consistency
    enableRetries: true,
  });
}
