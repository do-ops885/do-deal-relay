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

/**
 * Returns true when the SQL chunk contains nothing but `--` comment lines and
 * blank lines, so splitSqlStatements never emits comment-only chunks (e.g. a
 * trailing `-- note;` after a semicolon) as statements.
 */
function isCommentOnlyStatement(sql: string): boolean {
  return sql
    .split("\n")
    .every((line) => line.trim().length === 0 || line.trim().startsWith("--"));
}

/**
 * Split SQL without breaking quoted values or CREATE TRIGGER bodies.
 * D1Database.exec is inconsistent across local and remote runtimes when it
 * receives a large multi-statement string, while batch accepts the same
 * statements reliably.
 *
 * Chunks that contain only `--` comments (for example a trailing `-- note;`
 * after a semicolon) are dropped rather than emitted as statements.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let statement = "";
  let quote: "'" | '"' | "`" | null = null;
  let beginDepth = 0;
  let word = "";

  const flushWord = (): void => {
    if (word === "begin") beginDepth += 1;
    if (word === "end" && beginDepth > 0) beginDepth -= 1;
    word = "";
  };

  const pushStatement = (): void => {
    const trimmed = statement.trim();
    if (trimmed && !isCommentOnlyStatement(trimmed)) statements.push(trimmed);
    statement = "";
  };

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (!character) continue;

    if (quote) {
      statement += character;
      if (character === quote) {
        const next = sql[index + 1];
        if (next === quote) {
          statement += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      flushWord();
      quote = character;
      statement += character;
      continue;
    }

    if (/\w/.test(character)) {
      word += character.toLowerCase();
    } else {
      flushWord();
    }

    if (character === ";" && beginDepth === 0) {
      pushStatement();
    } else {
      statement += character;
    }
  }

  flushWord();
  pushStatement();
  return statements;
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
