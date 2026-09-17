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

const SQL_INLINE_COMMENT_START = "--";
const SQL_BLOCK_COMMENT_START = "/*";
const SQL_BLOCK_COMMENT_END = "*/";
const SQL_STATEMENT_TERMINATOR = ";";
const SQL_SINGLE_QUOTE = "'";
const SQL_DOUBLE_QUOTE = '"';
const SQL_SPACE = " ";
const SQL_EMPTY = "";

/**
 * Normalize SQL for D1 exec() so local (workerd/miniflare) and remote
 * engines accept identical input.
 *
 * Local D1 exec() splits input on line breaks (docs: "one or multiple
 * queries separated by \n"), so a multi-line single statement such as
 * `CREATE TABLE ... (\n ... )` is executed as an incomplete first line
 * (`incomplete input`). Flattening newlines to spaces keeps multi-statement
 * scripts (`;`-separated, including trigger bodies) intact on one line.
 *
 * Also strips inline `--` comments (outside string literals) which would
 * otherwise comment out the flattened remainder, strips block comments,
 * trims leading/trailing whitespace, and ensures a trailing semicolon so
 * the statement is complete on every engine path.
 */
export function normalizeExecSql(sql: string): string {
  const withoutFullLineComments = stripSqlComments(sql);
  const inputLength = withoutFullLineComments.length;
  let normalized = SQL_EMPTY;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let index = 0;

  while (index < inputLength) {
    const current = withoutFullLineComments.charAt(index);
    const next = withoutFullLineComments.charAt(index + 1);

    if (!inDoubleQuote && current === SQL_SINGLE_QUOTE) {
      if (inSingleQuote && next === SQL_SINGLE_QUOTE) {
        normalized += SQL_SINGLE_QUOTE + SQL_SINGLE_QUOTE;
        index += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      normalized += current;
      index += 1;
      continue;
    }

    if (!inSingleQuote && current === SQL_DOUBLE_QUOTE) {
      inDoubleQuote = !inDoubleQuote;
      normalized += current;
      index += 1;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      normalized += current;
      index += 1;
      continue;
    }

    if (
      current === SQL_INLINE_COMMENT_START.charAt(0) &&
      next === SQL_INLINE_COMMENT_START.charAt(1)
    ) {
      while (
        index < inputLength &&
        withoutFullLineComments.charAt(index) !== "\n"
      ) {
        index += 1;
      }
      continue;
    }

    if (
      current === SQL_BLOCK_COMMENT_START.charAt(0) &&
      next === SQL_BLOCK_COMMENT_START.charAt(1)
    ) {
      index += 2;
      while (index < inputLength) {
        const inner = withoutFullLineComments.charAt(index);
        const innerNext = withoutFullLineComments.charAt(index + 1);
        if (
          inner === SQL_BLOCK_COMMENT_END.charAt(0) &&
          innerNext === SQL_BLOCK_COMMENT_END.charAt(1)
        ) {
          index += 2;
          break;
        }
        index += 1;
      }
      if (normalized.length > 0 && !normalized.endsWith(SQL_SPACE)) {
        normalized += SQL_SPACE;
      }
      continue;
    }

    if (current === "\r" || current === "\n") {
      if (normalized.length > 0 && !normalized.endsWith(SQL_SPACE)) {
        normalized += SQL_SPACE;
      }
      if (current === "\r" && next === "\n") {
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    normalized += current;
    index += 1;
  }

  const trimmed = normalized.trim();
  if (trimmed.length === 0) {
    return SQL_EMPTY;
  }
  if (trimmed.endsWith(SQL_STATEMENT_TERMINATOR)) {
    return trimmed;
  }
  return trimmed + SQL_STATEMENT_TERMINATOR;
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
