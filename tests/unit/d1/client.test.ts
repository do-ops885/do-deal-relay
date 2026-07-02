import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import {
  D1Client,
  createD1Client,
  createD1ReadClient,
  createD1WriteClient,
  type QueryResult,
} from "../../../worker/lib/d1/client";
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

  // ============================================================================
  // transaction()
  // ============================================================================

  describe("transaction()", () => {
    it("runs all operations and returns success with results", async () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      const op1 = vi.fn().mockResolvedValue("a");
      const op2 = vi.fn().mockResolvedValue("b");

      const result = await client.transaction<string>([op1, op2]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual(["a", "b"]);
    });

    it("runs compensation for completed ops when a later op fails", async () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      const op1 = vi.fn().mockResolvedValue(1);
      const op2 = vi.fn().mockRejectedValue(new Error("op failed"));
      const comp1 = vi.fn().mockResolvedValue(undefined);

      const result = await client.transaction<number>([op1, op2], [comp1]);

      expect(result.success).toBe(false);
      expect(comp1).toHaveBeenCalledWith(1);
    });

    it("returns success=false with error message when an op throws", async () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      const result = await client.transaction<string>([
        vi.fn().mockRejectedValue(new Error("boom")),
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toBe("boom");
    });

    it("swallows compensation errors and continues with remaining compensations", async () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      const op1 = vi.fn().mockResolvedValue(1);
      const op2 = vi.fn().mockResolvedValue(2);
      const failingOp = vi.fn().mockRejectedValue(new Error("trigger"));

      // First comp throws, second runs
      const comp1 = vi.fn().mockRejectedValue(new Error("comp-bad"));
      const comp2 = vi.fn().mockResolvedValue(undefined);

      const result = await client.transaction<number>(
        [op1, op2, failingOp],
        [comp1, comp2],
      );

      expect(result.success).toBe(false);
      // Both compensations should be attempted (transaction iterates by result index)
      // and the loop swallows comp1's error so comp2 still runs.
      expect(comp1).toHaveBeenCalledWith(1);
      expect(comp2).toHaveBeenCalledWith(2);
    });
  });

  // ============================================================================
  // queryWithJson() / insertWithJson()
  // ============================================================================

  describe("queryWithJson()", () => {
    it("parses stringified JSON fields into objects", async () => {
      const json = JSON.stringify({ foo: "bar", n: 42 });
      const { db } = buildMockDb({
        runResult: {
          results: [
            { id: 1, meta: json },
            { id: 2, meta: json },
          ],
        },
      });
      const client = new D1Client(db);

      const result = await client.queryWithJson<{
        id: number;
        meta: Record<string, unknown>;
      }>("SELECT id, meta FROM deals WHERE id IN (?, ?)", [1, 2], ["meta"]);

      expect(result.success).toBe(true);
      expect(result.data?.[0]?.meta).toEqual({ foo: "bar", n: 42 });
      expect(result.data?.[1]?.meta).toEqual({ foo: "bar", n: 42 });
    });

    it("keeps non-JSON strings as-is", async () => {
      const { db } = buildMockDb({
        runResult: {
          results: [{ id: 1, note: "not json" }],
        },
      });
      const client = new D1Client(db);

      const result = await client.queryWithJson<{ id: number; note: string }>(
        "SELECT id, note FROM deals",
        [],
        ["note"],
      );

      expect(result.data?.[0]?.note).toBe("not json");
    });
  });

  describe("insertWithJson()", () => {
    it("stringifies specified fields before insertion", async () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      await client.insertWithJson(
        "deals",
        { id: 1, title: "Hello", meta: { nested: true } },
        ["meta"],
      );

      // Verify that the meta field was JSON-stringified in the bound params
      const bindCall = (
        (db.prepare as Mock).mock.results[0]?.value as {
          bind: Mock;
        }
      ).bind.mock.calls[0] as unknown[];

      expect(bindCall).toBeDefined();
      const metaParam = bindCall[2];
      expect(typeof metaParam).toBe("string");
      expect(JSON.parse(metaParam as string)).toEqual({ nested: true });
    });

    it("inserts without modification when jsonFields is empty", async () => {
      const { db } = buildMockDb();
      const client = new D1Client(db);

      await client.insertWithJson("deals", { id: 1, title: "Hello" });

      const bindCall = (
        (db.prepare as Mock).mock.results[0]?.value as {
          bind: Mock;
        }
      ).bind.mock.calls[0] as unknown[];

      expect(bindCall).toEqual([1, "Hello"]);
    });
  });

  // ============================================================================
  // Retry logic
  // ============================================================================

  describe("retry logic", () => {
    it("retries transient errors up to maxRetries times", async () => {
      const run = vi
        .fn()
        .mockRejectedValueOnce(new Error("network glitch"))
        .mockRejectedValueOnce(new Error("network glitch"))
        .mockResolvedValueOnce({
          results: [{ id: 1 }],
          meta: { rows_read: 1 },
        });

      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({ run, first: vi.fn(), all: vi.fn() }),
          run,
          first: vi.fn(),
          all: vi.fn(),
        }),
        batch: vi.fn(),
        exec: vi.fn(),
        withSession: vi.fn(),
      } as unknown as D1Database;

      const client = new D1Client(db, {
        enableRetries: true,
        maxRetries: 3,
        retryDelayMs: 10,
      });

      const promise = client.query<{ id: number }>("SELECT * FROM deals");
      // Flush microtasks plus any scheduled delay
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(run).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ id: 1 }]);
    });

    it("does NOT retry on SQL syntax errors", async () => {
      const run = vi
        .fn()
        .mockRejectedValue(new Error("syntax error near SELECT"));

      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({ run, first: vi.fn(), all: vi.fn() }),
          run,
          first: vi.fn(),
          all: vi.fn(),
        }),
        batch: vi.fn(),
        exec: vi.fn(),
        withSession: vi.fn(),
      } as unknown as D1Database;

      const client = new D1Client(db, { enableRetries: true, maxRetries: 3 });

      const result = await client.query("SELECT bad_col FROM deals");

      expect(run).toHaveBeenCalledTimes(1); // No retries
      expect(result.success).toBeUndefined();
      expect(
        (result as QueryResult<unknown> & { error?: string }).error,
      ).toContain("syntax error");
    });

    it("does NOT retry on 'no such table' errors", async () => {
      const run = vi.fn().mockRejectedValue(new Error("no such table: deals"));

      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({ run, first: vi.fn(), all: vi.fn() }),
          run,
          first: vi.fn(),
          all: vi.fn(),
        }),
        batch: vi.fn(),
        exec: vi.fn(),
        withSession: vi.fn(),
      } as unknown as D1Database;

      const client = new D1Client(db, { enableRetries: true, maxRetries: 3 });
      const result = await client.query("SELECT * FROM deals");

      expect(run).toHaveBeenCalledTimes(1);
      expect(
        (result as QueryResult<unknown> & { error?: string }).error,
      ).toBeDefined();
    });

    it("does NOT retry when retries disabled", async () => {
      const run = vi.fn().mockRejectedValue(new Error("transient"));

      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({ run, first: vi.fn(), all: vi.fn() }),
          run,
          first: vi.fn(),
          all: vi.fn(),
        }),
        batch: vi.fn(),
        exec: vi.fn(),
        withSession: vi.fn(),
      } as unknown as D1Database;

      const client = new D1Client(db, { enableRetries: false, maxRetries: 5 });
      const result = await client.query("SELECT 1");

      expect(run).toHaveBeenCalledTimes(1);
      expect(
        (result as QueryResult<unknown> & { error?: string }).error,
      ).toContain("transient");
    });
  });

  // ============================================================================
  // Factory functions
  // ============================================================================

  describe("factory functions", () => {
    it("createD1Client returns a configured D1Client", () => {
      const { db } = buildMockDb();
      const client = createD1Client(db, { maxRetries: 7 });

      const cAny = client as unknown as { config: { maxRetries: number } };
      expect(cAny.config.maxRetries).toBe(7);
    });

    it("createD1ReadClient uses sessions with first-unconstrained", () => {
      const { db, mocks } = buildMockDb();
      const client = createD1ReadClient(db);

      const cAny = client as unknown as {
        config: {
          useSessions: boolean;
          sessionBookmark: string;
          enableRetries: boolean;
        };
      };
      expect(cAny.config.useSessions).toBe(true);
      expect(cAny.config.sessionBookmark).toBe("first-unconstrained");
      expect(cAny.config.enableRetries).toBe(true);
      expect(mocks.withSession).toHaveBeenCalledWith("first-unconstrained");
    });

    it("createD1ReadClient uses a custom bookmark when provided", () => {
      const { db, mocks } = buildMockDb();
      createD1ReadClient(db, "custom-bm");

      expect(mocks.withSession).toHaveBeenCalledWith("custom-bm");
    });

    it("createD1WriteClient uses sessions with first-primary bookmark", () => {
      const { db, mocks } = buildMockDb();
      const client = createD1WriteClient(db);

      const cAny = client as unknown as {
        config: {
          useSessions: boolean;
          sessionBookmark: string;
        };
      };
      expect(cAny.config.useSessions).toBe(true);
      expect(cAny.config.sessionBookmark).toBe("first-primary");
      expect(mocks.withSession).toHaveBeenCalledWith("first-primary");
    });
  });
});
