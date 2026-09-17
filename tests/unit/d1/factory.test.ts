/**
 * Unit tests for worker/lib/d1/factory.ts
 *
 * Covers stripSqlComments (SQL comment stripping helpers) and the
 * createD1Client / createD1ReadClient / createD1WriteClient factories,
 * including their session-bookmark and retry configuration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  stripSqlComments,
  normalizeExecSql,
  createD1Client,
  createD1ReadClient,
  createD1WriteClient,
} from "../../../worker/lib/d1/factory";
import { D1Client } from "../../../worker/lib/d1/client";

// ============================================================================
// Mocks
// ============================================================================

/**
 * Session-aware D1 test double. Cast rationale: only implements the
 * D1Database surface exercised by the factory and D1Client constructor
 * (prepare/exec/batch/withSession); the single widening here keeps the
 * exposed mocks fully typed.
 */
function createSessionAwareDb() {
  const prepare = vi.fn((_sql: string) => ({
    bind: vi.fn(() => ({
      run: vi.fn(async () => ({ results: [], meta: {} })),
    })),
  }));
  const exec = vi.fn(async () => undefined);
  const batch = vi.fn(async (_statements: unknown[]) => []);
  const withSession = vi.fn((bookmark?: string) => ({
    prepare,
    getBookmark: vi.fn(() => bookmark ?? null),
    exec,
  }));

  const db = { prepare, batch, exec, withSession } as unknown as D1Database;

  return { db, prepare, exec, batch, withSession };
}

/**
 * Structural view of D1Client's private config field, used to assert
 * factory wiring that is otherwise unobservable from public methods.
 * Same precedent as tests/unit/d1/client.core.test.ts.
 */
interface ClientInternals {
  config: {
    enableRetries: boolean;
    maxRetries: number;
    useSessions: boolean;
    sessionBookmark: string;
  };
}

describe("d1/factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // stripSqlComments
  // ==========================================================================

  describe("stripSqlComments", () => {
    it("removes full-line comments and blank lines", () => {
      expect(stripSqlComments("-- schema header\n\nSELECT 1;\n")).toBe(
        "SELECT 1;",
      );
    });

    it("collapses whitespace-only lines between statements", () => {
      expect(stripSqlComments("SELECT 1;\n\n   \n\t\nSELECT 2;")).toBe(
        "SELECT 1;\nSELECT 2;",
      );
    });

    it("preserves inline comments on executable lines", () => {
      const sql = "SELECT 1 -- trailing note\nFROM t;";
      expect(stripSqlComments(sql)).toBe(sql);
    });

    it("preserves multi-line block comments", () => {
      const sql = "/* migration\n   header */\nSELECT 1;";
      expect(stripSqlComments(sql)).toBe(sql);
    });

    it("returns an empty string for comment-only input", () => {
      expect(stripSqlComments("-- a\n   -- b\n")).toBe("");
    });

    it("returns an empty string for empty input", () => {
      expect(stripSqlComments("")).toBe("");
    });
  });

  // ==========================================================================
  // normalizeExecSql (local workerd exec compatibility)
  // ==========================================================================

  describe("normalizeExecSql", () => {
    it("trims whitespace and appends a trailing semicolon when missing", () => {
      const normalized = normalizeExecSql(
        "\n      CREATE TABLE IF NOT EXISTS schema_migrations (\n" +
          "          version INTEGER PRIMARY KEY\n" +
          "      )\n    ",
      );
      expect(normalized).not.toContain("\n");
      expect(normalized).not.toContain("\r");
      expect(normalized).toBe(normalized.trim());
      expect(normalized.endsWith(";")).toBe(true);
      expect(normalized).toContain("CREATE TABLE IF NOT EXISTS");
      expect(normalized).toContain("version INTEGER PRIMARY KEY");
    });

    it("flattens multi-line statements to a single line for local exec", () => {
      const normalized = normalizeExecSql(
        "CREATE TABLE t (\n  id INTEGER PRIMARY KEY,\n  name TEXT\n);",
      );
      expect(normalized).not.toContain("\n");
      expect(normalized.endsWith(";")).toBe(true);
      expect(normalized).toContain("CREATE TABLE t (");
    });

    it("keeps an existing trailing semicolon without duplicating it", () => {
      expect(normalizeExecSql("SELECT 1;")).toBe("SELECT 1;");
      expect(normalizeExecSql("SELECT 1;;")).toBe("SELECT 1;;");
    });

    it("strips inline line comments outside string literals", () => {
      const normalized = normalizeExecSql("SELECT 1 -- trailing note\nFROM t;");
      expect(normalized).not.toContain("--");
      expect(normalized).toContain("SELECT 1");
      expect(normalized).toContain("FROM t;");
    });

    it("preserves comment-like text inside single-quoted strings", () => {
      const normalized = normalizeExecSql("SELECT '-- not a comment';");
      expect(normalized).toContain("'-- not a comment'");
    });

    it("strips block comments without merging adjacent tokens", () => {
      const normalized = normalizeExecSql("SELECT /* hidden */ 1;");
      expect(normalized).not.toContain("/*");
      expect(normalized).toContain("SELECT");
    });

    it("preserves inner semicolons of trigger bodies on one line", () => {
      const normalized = normalizeExecSql(
        "CREATE TRIGGER trg AFTER INSERT ON t BEGIN\n" +
          "  UPDATE t SET n = 1 WHERE id = new.id;\n" +
          "END;",
      );
      expect(normalized).not.toContain("\n");
      expect(normalized).toContain("BEGIN");
      expect(normalized).toContain("END;");
    });

    it("returns an empty string for comment-only input", () => {
      expect(normalizeExecSql("-- only a comment\n-- nothing else\n")).toBe("");
    });

    it("returns an empty string for empty input", () => {
      expect(normalizeExecSql("   \n  ")).toBe("");
    });
  });

  // ==========================================================================
  // createD1Client
  // ==========================================================================

  describe("createD1Client", () => {
    it("returns a D1Client without opening a session by default", () => {
      const mock = createSessionAwareDb();

      const client = createD1Client(mock.db);

      expect(client).toBeInstanceOf(D1Client);
      expect(mock.withSession).not.toHaveBeenCalled();
      expect(client.getBookmark()).toBeNull();
    });

    it("forwards custom configuration including sessions", () => {
      const mock = createSessionAwareDb();

      const client = createD1Client(mock.db, {
        useSessions: true,
        sessionBookmark: "custom-bookmark",
        enableRetries: false,
        maxRetries: 5,
      });

      expect(mock.withSession).toHaveBeenCalledWith("custom-bookmark");
      expect(client.getBookmark()).toBe("custom-bookmark");

      const internals = client as unknown as ClientInternals;
      expect(internals.config.enableRetries).toBe(false);
      expect(internals.config.maxRetries).toBe(5);
    });
  });

  // ==========================================================================
  // createD1ReadClient
  // ==========================================================================

  describe("createD1ReadClient", () => {
    it("opens a session at the first-unconstrained bookmark by default", () => {
      const mock = createSessionAwareDb();

      const client = createD1ReadClient(mock.db);

      expect(client).toBeInstanceOf(D1Client);
      expect(mock.withSession).toHaveBeenCalledWith("first-unconstrained");
      expect(client.getBookmark()).toBe("first-unconstrained");
    });

    it("honors a caller-provided starting bookmark", () => {
      const mock = createSessionAwareDb();

      const client = createD1ReadClient(mock.db, "bookmark-42");

      expect(mock.withSession).toHaveBeenCalledWith("bookmark-42");
      expect(client.getBookmark()).toBe("bookmark-42");
    });

    it("enables retries for read paths", () => {
      const mock = createSessionAwareDb();

      const internals = createD1ReadClient(
        mock.db,
      ) as unknown as ClientInternals;

      expect(internals.config.enableRetries).toBe(true);
      expect(internals.config.useSessions).toBe(true);
    });
  });

  // ==========================================================================
  // createD1WriteClient
  // ==========================================================================

  describe("createD1WriteClient", () => {
    it("pins the session to first-primary for immediate consistency", () => {
      const mock = createSessionAwareDb();

      const client = createD1WriteClient(mock.db);

      expect(client).toBeInstanceOf(D1Client);
      expect(mock.withSession).toHaveBeenCalledWith("first-primary");
      expect(client.getBookmark()).toBe("first-primary");
    });

    it("enables retries for write paths", () => {
      const mock = createSessionAwareDb();

      const internals = createD1WriteClient(
        mock.db,
      ) as unknown as ClientInternals;

      expect(internals.config.enableRetries).toBe(true);
      expect(internals.config.useSessions).toBe(true);
      expect(internals.config.sessionBookmark).toBe("first-primary");
    });
  });
});
