import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { D1Client } from "../../../worker/lib/d1/client";
import type { D1Database } from "@cloudflare/workers-types";

// ============================================================================
// Test Mocks
// ============================================================================

/**
 * Build a mock D1Database with preset query exec results.
 */
function buildMockDb(
  options: {
    runResult?: { results?: unknown[]; meta?: Record<string, unknown> };
    firstResult?: unknown;
    execResult?: void;
    batchResults?: Array<{
      results?: unknown[];
      meta?: Record<string, unknown>;
    }>;
  } = {},
) {
  const runMock = vi.fn().mockResolvedValue(
    options.runResult ?? {
      results: [],
      meta: { rows_read: 0, rows_written: 0 },
    },
  );
  const firstMock = vi.fn().mockResolvedValue(options.firstResult ?? null);
  const allMock = vi.fn().mockResolvedValue(options.runResult?.results ?? []);
  const execMock = vi.fn().mockResolvedValue(options.execResult);
  const batchMock = vi.fn().mockResolvedValue(options.batchResults ?? []);

  const bindMock = vi.fn().mockReturnValue({
    run: runMock,
    first: firstMock,
    all: allMock,
  });

  const prepareMock = vi.fn().mockReturnValue({
    bind: bindMock,
    run: runMock,
    first: firstMock,
    all: allMock,
  });

  const withSessionMock = vi.fn().mockReturnValue({
    prepare: prepareMock,
    getBookmark: vi.fn().mockReturnValue("bookmark-abc"),
    exec: execMock,
  });

  const db = {
    prepare: prepareMock,
    batch: batchMock,
    exec: execMock,
    withSession: withSessionMock,
  } as unknown as D1Database;

  return {
    db,
    mocks: {
      prepare: prepareMock,
      bind: bindMock,
      run: runMock,
      first: firstMock,
      all: allMock,
      exec: execMock,
      batch: batchMock,
      withSession: withSessionMock,
    },
  };
}

describe("d1/client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // Constructor / Config
  // ============================================================================

  describe("constructor configuration", () => {
    it("applies defaults for unset configuration values", () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      // Default config
      const clientAny = client as unknown as {
        config: {
          enableRetries: boolean;
          maxRetries: number;
          retryDelayMs: number;
          useSessions: boolean;
          sessionBookmark: string;
        };
      };

      expect(clientAny.config.enableRetries).toBe(true);
      expect(clientAny.config.maxRetries).toBe(3);
      expect(clientAny.config.retryDelayMs).toBe(100);
      expect(clientAny.config.useSessions).toBe(false);
      expect(clientAny.config.sessionBookmark).toBe("first-unconstrained");
    });

    it("overrides defaults with provided values", () => {
      const { db } = buildMockDb();
      const client = new D1Client(db, {
        enableRetries: false,
        maxRetries: 5,
        retryDelayMs: 250,
        useSessions: true,
        sessionBookmark: "custom-bookmark",
      });

      const clientAny = client as unknown as {
        config: {
          enableRetries: boolean;
          maxRetries: number;
          retryDelayMs: number;
          useSessions: boolean;
          sessionBookmark: string;
        };
      };

      expect(clientAny.config.enableRetries).toBe(false);
      expect(clientAny.config.maxRetries).toBe(5);
      expect(clientAny.config.retryDelayMs).toBe(250);
      expect(clientAny.config.useSessions).toBe(true);
      expect(clientAny.config.sessionBookmark).toBe("custom-bookmark");
    });

    it("creates a session via db.withSession when useSessions=true", () => {
      const { db, mocks } = buildMockDb();
      new D1Client(db, { useSessions: true, sessionBookmark: "b1" });

      expect(mocks.withSession).toHaveBeenCalledWith("b1");
    });

    it("does NOT create a session when useSessions=false", () => {
      const { db, mocks } = buildMockDb();
      new D1Client(db, { useSessions: false });

      expect(mocks.withSession).not.toHaveBeenCalled();
    });

    it("getBookmark returns session bookmark when session is active", () => {
      const { db } = buildMockDb();
      const client = new D1Client(db, { useSessions: true });

      const bookmark = client.getBookmark();
      expect(bookmark).toBe("bookmark-abc");
    });

    it("getBookmark returns null when no session is active", () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      expect(client.getBookmark()).toBeNull();
    });
  });

  // ============================================================================
  // query() / queryFirst()
  // ============================================================================

  describe("query()", () => {
    it("prepares the SQL and runs it with bound params", async () => {
      const { db, mocks } = buildMockDb({
        runResult: {
          results: [{ id: 1 }],
          meta: {
            rows_read: 1,
            rows_written: 0,
            last_row_id: 1,
            served_by_region: "us-east",
            served_by_primary: true,
          },
        },
      });
      const client = new D1Client(db);

      const result = await client.query<{ id: number }>(
        "SELECT id FROM deals WHERE active = ?",
        [true],
      );

      expect(mocks.prepare).toHaveBeenCalledWith(
        "SELECT id FROM deals WHERE active = ?",
      );
      expect(mocks.bind).toHaveBeenCalledWith(true);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.meta?.rows_read).toBe(1);
      expect(result.meta?.last_row_id).toBe(1);
      expect(result.meta?.served_by_region).toBe("us-east");
      expect(result.meta?.served_by_primary).toBe(true);
    });

    it("uses empty-data defaults when D1 returns no results", async () => {
      const { db, mocks } = buildMockDb();
      // Override the default run mock to return undefined results
      mocks.run.mockResolvedValueOnce({
        results: undefined as unknown as undefined,
        meta: {},
      });
      const client = new D1Client(db);

      const result = await client.query<unknown>("SELECT 1");
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe("queryFirst()", () => {
    it("returns the row wrapped in SingleResult", async () => {
      const { db } = buildMockDb({ firstResult: { id: 7, name: "Alice" } });
      const client = new D1Client(db);

      const result = await client.queryFirst<{ id: number; name: string }>(
        "SELECT * FROM users WHERE id = ?",
        [7],
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 7, name: "Alice" });
    });

    it("returns null data when no row found", async () => {
      const { db } = buildMockDb({ firstResult: null });
      const client = new D1Client(db);

      const result = await client.queryFirst<{ id: number }>(
        "SELECT * FROM users WHERE id = ?",
        [99],
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  // ============================================================================
  // execute() / raw()
  // ============================================================================

  describe("execute()", () => {
    it("runs an INSERT/UPDATE/DELETE and returns meta", async () => {
      const { db } = buildMockDb({
        runResult: { meta: { last_row_id: 42, changes: 1 } },
      });
      const client = new D1Client(db);

      const result = await client.execute(
        "DELETE FROM deals WHERE id = ?",
        [1],
      );

      expect(result.success).toBe(true);
      expect(result.lastRowId).toBe(42);
      expect(result.changes).toBe(1);
    });

    it("rejects instead of resolving an error envelope when the write fails", async () => {
      const { db, mocks } = buildMockDb();
      (mocks.run as Mock).mockRejectedValueOnce(
        new Error("constraint failed: UNIQUE"),
      );
      const client = new D1Client(db);

      await expect(
        client.execute("INSERT INTO deals (id) VALUES (?)", [1]),
      ).rejects.toThrow("constraint failed");
    });
  });

  describe("raw()", () => {
    it("strips SQL line-comments and blank lines before executing", async () => {
      const { db, mocks } = buildMockDb({ execResult: undefined });
      const client = new D1Client(db);

      const sql = `-- this is a comment\nCREATE TABLE foo (id INTEGER);\n-- another\n`;

      await client.raw(sql);

      const execArg = (mocks.exec as Mock).mock.calls[0]?.[0] as string;
      expect(execArg).not.toContain("--");
      expect(execArg).not.toMatch(/^\s*$/m);
      expect(execArg).toContain("CREATE TABLE foo");
    });

    it("preserves inline trailing comments after SQL keywords", async () => {
      const { db, mocks } = buildMockDb({ execResult: undefined });
      const client = new D1Client(db);

      await client.raw("SELECT 1 -- inline trailing comment\n");

      const execArg = (mocks.exec as Mock).mock.calls[0]?.[0] as string;
      // Behavior: the comment line itself is removed, but the SQL line keeps "SELECT 1"
      expect(execArg).toContain("SELECT 1");
    });

    it("returns success without executing when SQL is empty after stripping comments", async () => {
      const { db, mocks } = buildMockDb({ execResult: undefined });
      const client = new D1Client(db);

      const result = await client.raw("-- only comments\n-- nothing else\n");

      expect(result.success).toBe(true);
      expect(mocks.exec).not.toHaveBeenCalled();
    });

    it("rejects when the underlying exec fails", async () => {
      const { db, mocks } = buildMockDb();
      (mocks.exec as Mock).mockRejectedValueOnce(new Error("disk I/O error"));
      const client = new D1Client(db);

      await expect(
        client.raw("CREATE TABLE foo (id INTEGER);"),
      ).rejects.toThrow("disk I/O error");
    });
  });

  // ============================================================================
  // batch() / batchInsert()
  // ============================================================================

  describe("batch()", () => {
    it("issues a single db.batch call with prepared statements", async () => {
      const { db, mocks } = buildMockDb({
        batchResults: [
          { results: [{ id: 1 }], meta: { rows_written: 1, last_row_id: 1 } },
          { results: [{ id: 2 }], meta: { rows_written: 1, last_row_id: 2 } },
        ],
      });
      const client = new D1Client(db);

      const result = await client.batch<{ id: number }>([
        { sql: "INSERT INTO deals (id) VALUES (?)", params: [1] },
        { sql: "INSERT INTO deals (id) VALUES (?)", params: [2] },
      ]);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.data).toEqual([{ id: 1 }]);
      expect(result.results[1]?.data).toEqual([{ id: 2 }]);
      expect(mocks.batch).toHaveBeenCalledTimes(1);
    });

    it("rejects when the underlying batch fails", async () => {
      const { db, mocks } = buildMockDb();
      (mocks.batch as Mock).mockRejectedValueOnce(
        new Error("too many statements"),
      );
      const client = new D1Client(db);

      await expect(
        client.batch([
          { sql: "INSERT INTO deals (id) VALUES (?)", params: [1] },
        ]),
      ).rejects.toThrow("too many statements");
    });
  });

  describe("batchInsert()", () => {
    it("returns an empty lastRowIds list for an empty input", async () => {
      const { db, mocks } = buildMockDb();
      const client = new D1Client(db);

      const result = await client.batchInsert("deals", []);
      expect(result.success).toBe(true);
      expect(result.lastRowIds).toEqual([]);
      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("inserts each row via a parameterized INSERT and returns lastRowIds", async () => {
      const { db } = buildMockDb({
        batchResults: [
          { results: [], meta: { last_row_id: 11 } },
          { results: [], meta: { last_row_id: 12 } },
          { results: [], meta: { last_row_id: 13 } },
        ],
      });
      const client = new D1Client(db);

      const result = await client.batchInsert("deals", [
        { code: "A1", domain: "example.com" },
        { code: "A2", domain: "example.com" },
        { code: "A3", domain: "example.com" },
      ]);

      expect(result.success).toBe(true);
      expect(result.lastRowIds).toEqual([11, 12, 13]);
    });

    it("returns success=false when the underlying batch fails", async () => {
      const { db } = buildMockDb({
        batchResults: [],
      });
      const client = new D1Client(db, { enableRetries: false });

      // Force failure with a SQL syntax error
      vi.mocked(db.prepare as unknown as Mock).mockImplementationOnce(() => {
        throw new Error("syntax error near INSERT");
      });

      const result = await client.batchInsert("deals", [{ code: "X1" }]);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // prepare() / runPrepared()
  // ============================================================================

  describe("prepare() / runPrepared()", () => {
    it("prepare returns the underlying prepared statement", () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);
      const stmt = client.prepare("SELECT 1");

      expect(stmt).toBeDefined();
    });

    it("runPrepared binds params and returns the result envelope", async () => {
      const { db } = buildMockDb({
        runResult: { results: [{ id: 1 }], meta: { rows_read: 1 } },
      });
      const client = new D1Client(db);
      const stmt = client.prepare("SELECT * FROM deals WHERE id = ?");

      const result = await client.runPrepared<{ id: number }>(stmt, [1]);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ id: 1 }]);
    });
  });
});
