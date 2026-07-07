import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  acquireLock,
  releaseLock,
  extendLock,
  getLockStatus,
} from "../../worker/lib/lock";
import type { Env } from "../../worker/types";
import { PipelineError } from "../../worker/types";

// ============================================================================
// PipelineLock Unit Tests
// ============================================================================
// Tests the D1 CAS-based distributed lock used to serialize pipeline runs.
// Mocks D1 at the prepare().bind() level to simulate database behavior
// including concurrency, expiry, and error scenarios.
// ============================================================================

interface LockRow {
  lock_name: string;
  run_id: string;
  trace_id: string;
  acquired_at: string;
  expires_at: string;
}

/**
 * Creates a mock D1 database backed by an in-memory Map.
 * Simulates D1's prepare().bind().first() and batch() APIs
 * with correct SQL routing for INSERT OR IGNORE, UPDATE with expiry check,
 * SELECT, and DELETE operations.
 *
 * SQL routing for `first()`:
 *   - getLockStatus: SELECT run_id, trace_id, expires_at (no acquired_at)
 *   - acquireLock batch SELECT: SELECT run_id, trace_id, acquired_at, expires_at
 *   - extendLock/releaseLock check: SELECT trace_id, expires_at
 */
function createMockD1(storage: Map<string, LockRow>) {
  const LOCK_NAME = "pipeline:lock";

  function createBoundStatement(sql: string, boundParams: unknown[]) {
    return {
      first: vi.fn(async () => {
        const row = storage.get(LOCK_NAME);
        if (!row) return null;

        // getLockStatus path: SELECT run_id, trace_id, expires_at (no acquired_at)
        if (
          sql.includes("SELECT") &&
          sql.includes("run_id") &&
          sql.includes("trace_id") &&
          sql.includes("expires_at") &&
          !sql.includes("acquired_at")
        ) {
          return {
            run_id: row.run_id,
            trace_id: row.trace_id,
            expires_at: row.expires_at,
          };
        }

        // acquireLock batch SELECT: includes all four columns
        if (
          sql.includes("SELECT") &&
          sql.includes("run_id") &&
          sql.includes("trace_id") &&
          sql.includes("acquired_at")
        ) {
          return {
            run_id: row.run_id,
            trace_id: row.trace_id,
            acquired_at: row.acquired_at,
            expires_at: row.expires_at,
          };
        }

        // extendLock / releaseLock check: SELECT trace_id (and maybe expires_at)
        if (sql.includes("SELECT") && sql.includes("trace_id")) {
          return { trace_id: row.trace_id, expires_at: row.expires_at };
        }

        return null;
      }),

      run: vi.fn(async () => {
        // INSERT OR IGNORE — create lock if none exists
        if (sql.includes("INSERT OR IGNORE")) {
          const existing = storage.get(LOCK_NAME);
          if (!existing) {
            storage.set(LOCK_NAME, {
              lock_name: LOCK_NAME,
              run_id: boundParams[1] as string,
              trace_id: boundParams[2] as string,
              acquired_at: boundParams[3] as string,
              expires_at: boundParams[4] as string,
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }

        // UPDATE with expiry check — take over expired locks
        if (sql.includes("UPDATE") && sql.includes("expires_at <")) {
          const existing = storage.get(LOCK_NAME);
          if (existing) {
            const expiresAt = new Date(existing.expires_at);
            const now = new Date(boundParams[5] as string);
            if (expiresAt < now) {
              storage.set(LOCK_NAME, {
                lock_name: LOCK_NAME,
                run_id: boundParams[1] as string,
                trace_id: boundParams[2] as string,
                acquired_at: boundParams[3] as string,
                expires_at: boundParams[4] as string,
              });
              return { success: true, results: [], meta: { changes: 1 } };
            }
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }

        // UPDATE SET expires_at — lock extension
        if (sql.includes("UPDATE") && sql.includes("SET expires_at")) {
          const existing = storage.get(LOCK_NAME);
          if (existing && existing.trace_id === boundParams[2]) {
            storage.set(LOCK_NAME, {
              ...existing,
              expires_at: boundParams[1] as string,
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }

        // DELETE — release lock
        if (sql.includes("DELETE")) {
          const existing = storage.get(LOCK_NAME);
          if (existing && existing.trace_id === boundParams[1]) {
            storage.delete(LOCK_NAME);
          }
          return { success: true, results: [], meta: { changes: 1 } };
        }

        // Generic SELECT fallback for batch results
        if (sql.includes("SELECT")) {
          const row = storage.get(LOCK_NAME);
          if (!row) {
            return { success: true, results: [], meta: {} };
          }
          return {
            success: true,
            results: [
              {
                run_id: row.run_id,
                trace_id: row.trace_id,
                acquired_at: row.acquired_at,
                expires_at: row.expires_at,
              },
            ],
            meta: {},
          };
        }

        return { success: true, results: [], meta: { changes: 0 } };
      }),
    };
  }

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...params: unknown[]) => createBoundStatement(sql, params),
    })),
    batch: vi.fn(async (statements: unknown[]) => {
      const results = [];
      for (const stmt of statements) {
        const result = await (stmt as { run: () => Promise<unknown> }).run();
        results.push(result);
      }
      return results;
    }),
  } as unknown as D1Database;

  return db;
}

function createMockEnv(db: D1Database): Env {
  return {
    DEALS_PROD: {} as KVNamespace,
    DEALS_STAGING: {} as KVNamespace,
    DEALS_LOG: {} as KVNamespace,
    DEALS_LOCK: {} as KVNamespace,
    DEALS_SOURCES: {} as KVNamespace,
    DEALS_DB: db,
    AI_GATEWAY_URL: "https://gateway.test",
    WEBHOOK_SECRET: "test-secret",
    API_ENCRYPTION_KEY: "test-key",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
  } as unknown as Env;
}

describe("PipelineLock (D1 CAS)", () => {
  let storage: Map<string, LockRow>;
  let db: D1Database;
  let env: Env;

  beforeEach(() => {
    storage = new Map();
    db = createMockD1(storage);
    env = createMockEnv(db);
  });

  // ==========================================================================
  // acquireLock
  // ==========================================================================
  describe("acquireLock", () => {
    it("should acquire lock when no lock exists", async () => {
      const result = await acquireLock(env, "run-001", "trace-001");

      expect(result).toBe(true);
      expect(storage.has("pipeline:lock")).toBe(true);

      const lock = storage.get("pipeline:lock")!;
      expect(lock.run_id).toBe("run-001");
      expect(lock.trace_id).toBe("trace-001");
      expect(lock.acquired_at).toBeDefined();
      expect(lock.expires_at).toBeDefined();
    });

    it("should set correct TTL on acquisition (5 minutes)", async () => {
      const before = Date.now();
      await acquireLock(env, "run-001", "trace-001");
      const after = Date.now();

      const lock = storage.get("pipeline:lock")!;
      const acquiredMs = new Date(lock.acquired_at).getTime();
      const expiresMs = new Date(lock.expires_at).getTime();

      expect(acquiredMs).toBeGreaterThanOrEqual(before);
      expect(acquiredMs).toBeLessThanOrEqual(after);
      expect(expiresMs - acquiredMs).toBe(300_000); // CONFIG.LOCK_TTL_SECONDS * 1000
    });

    it("should fail acquisition when lock is held by another run", async () => {
      const futureExpiry = new Date(Date.now() + 600_000).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-existing",
        trace_id: "trace-existing",
        acquired_at: new Date().toISOString(),
        expires_at: futureExpiry,
      });

      await expect(acquireLock(env, "run-new", "trace-new")).rejects.toThrow(
        PipelineError,
      );

      await expect(acquireLock(env, "run-new", "trace-new")).rejects.toThrow(
        "Lock held by run run-existing",
      );
    });

    it("should take over an expired lock", async () => {
      const pastExpiry = new Date(Date.now() - 600_000).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-expired",
        trace_id: "trace-expired",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: pastExpiry,
      });

      const result = await acquireLock(env, "run-fresh", "trace-fresh");

      expect(result).toBe(true);
      const lock = storage.get("pipeline:lock")!;
      expect(lock.run_id).toBe("run-fresh");
      expect(lock.trace_id).toBe("trace-fresh");
    });

    it("should mark acquisition errors as retryable", async () => {
      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("D1 connection refused"),
      );

      try {
        await acquireLock(env, "run-001", "trace-001");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(true);
        expect((error as PipelineError).errorClass).toBe("ConcurrencyError");
      }
    });

    it("should include error details on failure", async () => {
      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("D1 timeout"),
      );

      try {
        await acquireLock(env, "run-001", "trace-001");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as PipelineError).message).toContain(
          "Lock acquisition failed",
        );
        expect((error as PipelineError).message).toContain("D1 timeout");
      }
    });

    it("should not retry on ConcurrencyError (non-retryable)", async () => {
      const futureExpiry = new Date(Date.now() + 600_000).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-holding",
        trace_id: "trace-holding",
        acquired_at: new Date().toISOString(),
        expires_at: futureExpiry,
      });

      try {
        await acquireLock(env, "run-new", "trace-new");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(false);
      }
    });

    it("should use single D1 batch for atomicity", async () => {
      await acquireLock(env, "run-001", "trace-001");

      expect(db.batch).toHaveBeenCalledTimes(1);
      // Batch should contain INSERT, UPDATE, and SELECT statements
      const batchMock = db.batch as ReturnType<typeof vi.fn>;
      const batchArg = batchMock.mock.calls?.[0]?.[0];
      expect(batchArg).toHaveLength(3);
    });

    it("should wrap non-PipelineError exceptions as retryable", async () => {
      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        "string error value",
      );

      try {
        await acquireLock(env, "run-001", "trace-001");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(true);
        expect((error as PipelineError).message).toContain(
          "Lock acquisition failed",
        );
      }
    });
  });

  // ==========================================================================
  // Concurrent lock acquisition
  // ==========================================================================
  describe("concurrent lock acquisition", () => {
    it("should allow only one acquisition when called concurrently", async () => {
      const results = await Promise.allSettled([
        acquireLock(env, "run-A", "trace-A"),
        acquireLock(env, "run-B", "trace-B"),
      ]);

      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value === true,
      );
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
    });

    it("should reject all but first in a burst of 5 concurrent acquires", async () => {
      const attempts = Array.from({ length: 5 }, (_, i) =>
        acquireLock(env, `run-${i}`, `trace-${i}`),
      );

      const results = await Promise.allSettled(attempts);

      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value === true,
      );
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(4);
    });

    it("second concurrent acquisition should produce ConcurrencyError", async () => {
      const futureExpiry = new Date(Date.now() + 600_000).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-first",
        trace_id: "trace-first",
        acquired_at: new Date().toISOString(),
        expires_at: futureExpiry,
      });

      await expect(
        acquireLock(env, "run-second", "trace-second"),
      ).rejects.toThrow(PipelineError);
    });

    it("should serialize: release then re-acquire succeeds", async () => {
      await acquireLock(env, "run-1", "trace-1");
      await releaseLock(env, "trace-1");

      const result = await acquireLock(env, "run-2", "trace-2");
      expect(result).toBe(true);
      expect(storage.get("pipeline:lock")!.run_id).toBe("run-2");
    });
  });

  // ==========================================================================
  // releaseLock
  // ==========================================================================
  describe("releaseLock", () => {
    it("should release lock held by the same trace_id", async () => {
      await acquireLock(env, "run-1", "trace-1");
      expect(storage.has("pipeline:lock")).toBe(true);

      await releaseLock(env, "trace-1");

      expect(storage.has("pipeline:lock")).toBe(false);
    });

    it("should not release lock held by a different trace_id", async () => {
      await acquireLock(env, "run-1", "trace-1");
      await releaseLock(env, "trace-OTHER");

      // Lock should still exist with original owner
      expect(storage.has("pipeline:lock")).toBe(true);
      expect(storage.get("pipeline:lock")!.trace_id).toBe("trace-1");
    });

    it("should warn when no lock exists", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await releaseLock(env, "trace-nonexistent");

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("should warn when releasing with wrong trace_id", async () => {
      await acquireLock(env, "run-1", "trace-1");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await releaseLock(env, "trace-wrong");

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("should not throw on D1 errors during release", async () => {
      await acquireLock(env, "run-1", "trace-1");

      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("D1 error"),
      );

      // releaseLock swallows errors — lock treated as expired
      await expect(releaseLock(env, "trace-1")).resolves.toBeUndefined();
    });

    it("should use batch for atomic read-then-delete", async () => {
      await acquireLock(env, "run-1", "trace-1");
      (db.batch as ReturnType<typeof vi.fn>).mockClear();

      await releaseLock(env, "trace-1");

      expect(db.batch).toHaveBeenCalledTimes(1);
      const batchMock = db.batch as ReturnType<typeof vi.fn>;
      const batchArg = batchMock.mock.calls?.[0]?.[0];
      expect(batchArg).toHaveLength(2); // SELECT + DELETE
    });

    it("should release after re-acquire cycle", async () => {
      await acquireLock(env, "run-1", "trace-1");
      await releaseLock(env, "trace-1");
      await acquireLock(env, "run-2", "trace-2");
      await releaseLock(env, "trace-2");

      expect(storage.has("pipeline:lock")).toBe(false);
    });
  });

  // ==========================================================================
  // extendLock
  // ==========================================================================
  describe("extendLock", () => {
    it("should extend lock TTL when held by the same trace", async () => {
      await acquireLock(env, "run-1", "trace-1");

      const originalExpiry = new Date(
        storage.get("pipeline:lock")!.expires_at,
      ).getTime();

      await extendLock(env, "trace-1", 600);

      const newExpiry = new Date(
        storage.get("pipeline:lock")!.expires_at,
      ).getTime();

      expect(newExpiry).toBeGreaterThan(originalExpiry);
    });

    it("should set extension from current time, not from old expiry", async () => {
      await acquireLock(env, "run-1", "trace-1");

      const beforeExtend = Date.now();
      await extendLock(env, "trace-1", 120);
      const afterExtend = Date.now();

      const lock = storage.get("pipeline:lock")!;
      const newExpiry = new Date(lock.expires_at).getTime();
      const expectedMin = beforeExtend + 120_000;
      const expectedMax = afterExtend + 120_000;

      expect(newExpiry).toBeGreaterThanOrEqual(expectedMin - 1000);
      expect(newExpiry).toBeLessThanOrEqual(expectedMax + 1000);
    });

    it("should default to 300 seconds when no duration specified", async () => {
      await acquireLock(env, "run-1", "trace-1");

      const beforeExtend = Date.now();
      await extendLock(env, "trace-1");
      const afterExtend = Date.now();

      const lock = storage.get("pipeline:lock")!;
      const newExpiry = new Date(lock.expires_at).getTime();
      const expectedMin = beforeExtend + 300_000;

      expect(newExpiry).toBeGreaterThanOrEqual(expectedMin - 1000);
      expect(newExpiry).toBeLessThanOrEqual(afterExtend + 300_000);
    });

    it("should reject extension by non-owner", async () => {
      await acquireLock(env, "run-1", "trace-1");

      await expect(extendLock(env, "trace-OTHER")).rejects.toThrow(
        PipelineError,
      );
      await expect(extendLock(env, "trace-OTHER")).rejects.toThrow(
        "not owned by current trace",
      );
    });

    it("should reject extension when no lock exists", async () => {
      await expect(extendLock(env, "trace-1")).rejects.toThrow(PipelineError);
      await expect(extendLock(env, "trace-1")).rejects.toThrow(
        "Cannot extend lock",
      );
    });

    it("should mark extension errors as retryable", async () => {
      await acquireLock(env, "run-1", "trace-1");

      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("D1 connection lost"),
      );

      try {
        await extendLock(env, "trace-1");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(true);
      }
    });

    it("should not mark ownership rejection as retryable", async () => {
      await acquireLock(env, "run-1", "trace-1");

      try {
        await extendLock(env, "trace-wrong");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(false);
      }
    });
  });

  // ==========================================================================
  // getLockStatus
  // ==========================================================================
  describe("getLockStatus", () => {
    it("should report locked when a valid lock exists", async () => {
      await acquireLock(env, "run-1", "trace-1");

      const status = await getLockStatus(env);

      expect(status.locked).toBe(true);
      expect(status.run_id).toBe("run-1");
      expect(status.trace_id).toBe("trace-1");
      expect(status.expires_at).toBeDefined();
    });

    it("should report unlocked when no lock exists", async () => {
      const status = await getLockStatus(env);

      expect(status.locked).toBe(false);
      expect(status.run_id).toBeUndefined();
      expect(status.trace_id).toBeUndefined();
      expect(status.expires_at).toBeUndefined();
    });

    it("should report unlocked when lock is expired", async () => {
      const pastExpiry = new Date(Date.now() - 600_000).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-old",
        trace_id: "trace-old",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: pastExpiry,
      });

      const status = await getLockStatus(env);

      expect(status.locked).toBe(false);
    });

    it("should handle D1 errors gracefully (returns unlocked)", async () => {
      (db.prepare as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error("D1 read error")),
        }),
      });

      const status = await getLockStatus(env);

      expect(status.locked).toBe(false);
    });

    it("should use prepare().bind().first() pattern", async () => {
      await getLockStatus(env);

      expect(db.prepare).toHaveBeenCalledTimes(1);
      const prepareMock = db.prepare as ReturnType<typeof vi.fn>;
      const prepareArg = prepareMock.mock.calls?.[0]?.[0];
      expect(prepareArg).toContain("SELECT");
      expect(prepareArg).toContain("pipeline_locks");
    });

    it("should include all requested fields in result", async () => {
      const futureExpiry = new Date(Date.now() + 600_000).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-full",
        trace_id: "trace-full",
        acquired_at: new Date().toISOString(),
        expires_at: futureExpiry,
      });

      const status = await getLockStatus(env);

      expect(status).toEqual({
        locked: true,
        run_id: "run-full",
        trace_id: "trace-full",
        expires_at: futureExpiry,
      });
    });
  });

  // ==========================================================================
  // Lock expiry edge cases
  // ==========================================================================
  describe("lock expiry edge cases", () => {
    it("should treat lock expiring in the future as held", async () => {
      const futureExpiry = new Date(Date.now() + 1000).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-almost-expired",
        trace_id: "trace-almost-expired",
        acquired_at: new Date(Date.now() - 300_000).toISOString(),
        expires_at: futureExpiry,
      });

      await expect(acquireLock(env, "run-new", "trace-new")).rejects.toThrow(
        PipelineError,
      );
    });

    it("should clean up expired lock data and replace with new lock", async () => {
      const pastExpiry = new Date(Date.now() - 1).toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "old-run",
        trace_id: "old-trace",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: pastExpiry,
      });

      await acquireLock(env, "new-run", "new-trace");

      const lock = storage.get("pipeline:lock")!;
      expect(lock.run_id).toBe("new-run");
      expect(lock.trace_id).toBe("new-trace");
      expect(new Date(lock.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it("extendLock should update an already-expired lock if trace matches", async () => {
      await acquireLock(env, "run-1", "trace-1");
      const lock = storage.get("pipeline:lock")!;
      storage.set("pipeline:lock", {
        ...lock,
        expires_at: new Date(Date.now() - 1).toISOString(),
      });

      await extendLock(env, "trace-1", 600);

      const updated = storage.get("pipeline:lock")!;
      expect(new Date(updated.expires_at).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it("acquireLock: INSERT fails + UPDATE fails for expiring-now lock (strict < boundary)", async () => {
      // The production code uses `WHERE expires_at < ?6` (strict less-than).
      // When expires_at equals now, the UPDATE won't match and INSERT won't
      // insert (row exists). This results in the "unexpected state" error —
      // a known boundary gap in the current implementation.
      const nowIso = new Date().toISOString();
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "run-boundary",
        trace_id: "trace-boundary",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: nowIso,
      });

      await expect(acquireLock(env, "run-new", "trace-new")).rejects.toThrow(
        "Lock acquisition failed",
      );
    });
  });

  // ==========================================================================
  // Full lifecycle
  // ==========================================================================
  describe("full lock lifecycle", () => {
    it("acquire → status (locked) → release → status (unlocked)", async () => {
      await acquireLock(env, "run-1", "trace-1");

      let status = await getLockStatus(env);
      expect(status.locked).toBe(true);
      expect(status.run_id).toBe("run-1");

      await releaseLock(env, "trace-1");

      status = await getLockStatus(env);
      expect(status.locked).toBe(false);
    });

    it("acquire → extend → status (still locked, later expiry)", async () => {
      await acquireLock(env, "run-1", "trace-1");

      const beforeExtend = await getLockStatus(env);
      const originalExpiry = new Date(beforeExtend.expires_at!).getTime();

      await extendLock(env, "trace-1", 600);

      const afterExtend = await getLockStatus(env);
      expect(afterExtend.locked).toBe(true);
      expect(new Date(afterExtend.expires_at!).getTime()).toBeGreaterThan(
        originalExpiry,
      );
    });

    it("acquire → fail second acquire → release → succeed third acquire", async () => {
      await acquireLock(env, "run-1", "trace-1");

      await expect(acquireLock(env, "run-2", "trace-2")).rejects.toThrow(
        PipelineError,
      );

      await releaseLock(env, "trace-1");

      const result = await acquireLock(env, "run-2", "trace-2");
      expect(result).toBe(true);
      expect(storage.get("pipeline:lock")!.run_id).toBe("run-2");
    });

    it("acquire → release → acquire new → extend → release → final status unlocked", async () => {
      await acquireLock(env, "run-A", "trace-A");
      await releaseLock(env, "trace-A");

      await acquireLock(env, "run-B", "trace-B");
      await extendLock(env, "trace-B", 600);

      let status = await getLockStatus(env);
      expect(status.locked).toBe(true);
      expect(status.run_id).toBe("run-B");

      await releaseLock(env, "trace-B");

      status = await getLockStatus(env);
      expect(status.locked).toBe(false);
    });
  });

  // ==========================================================================
  // Error resilience
  // ==========================================================================
  describe("error resilience", () => {
    it("acquireLock propagates transient D1 batch failure as PipelineError", async () => {
      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("network blip"),
      );

      try {
        await acquireLock(env, "run-001", "trace-001");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(true);
        expect((error as PipelineError).message).toContain("network blip");
      }
    });

    it("releaseLock does not propagate D1 failures", async () => {
      await acquireLock(env, "run-1", "trace-1");

      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("D1 write failure"),
      );

      // Should not throw — errors are logged and swallowed
      await expect(releaseLock(env, "trace-1")).resolves.toBeUndefined();
    });

    it("getLockStatus returns unlocked on prepare failure", async () => {
      (db.prepare as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error("D1 read failure")),
        }),
      }));

      const status = await getLockStatus(env);
      expect(status.locked).toBe(false);
    });
  });

  // ==========================================================================
  // Metadata integrity
  // ==========================================================================
  describe("metadata integrity", () => {
    it("should preserve all lock fields through acquire-release cycle", async () => {
      await acquireLock(env, "run-1", "trace-1");

      const lock = storage.get("pipeline:lock")!;
      expect(lock.lock_name).toBe("pipeline:lock");
      expect(lock.run_id).toBe("run-1");
      expect(lock.trace_id).toBe("trace-1");
      expect(new Date(lock.acquired_at).toISOString()).toBe(lock.acquired_at);
      expect(new Date(lock.expires_at).toISOString()).toBe(lock.expires_at);

      await releaseLock(env, "trace-1");
      expect(storage.has("pipeline:lock")).toBe(false);
    });

    it("should overwrite previous lock data on takeover of expired lock", async () => {
      storage.set("pipeline:lock", {
        lock_name: "pipeline:lock",
        run_id: "old-run",
        trace_id: "old-trace",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: new Date(Date.now() - 1).toISOString(),
      });

      await acquireLock(env, "new-run", "new-trace");

      const lock = storage.get("pipeline:lock")!;
      expect(lock.run_id).toBe("new-run");
      expect(lock.trace_id).toBe("new-trace");
      expect(lock.acquired_at).not.toBe("2024-01-01T00:00:00Z");
    });

    it("acquired_at and expires_at should be valid ISO strings", async () => {
      await acquireLock(env, "run-1", "trace-1");

      const lock = storage.get("pipeline:lock")!;
      expect(() => new Date(lock.acquired_at)).not.toThrow();
      expect(() => new Date(lock.expires_at)).not.toThrow();
      expect(new Date(lock.acquired_at).toISOString()).toBe(lock.acquired_at);
      expect(new Date(lock.expires_at).toISOString()).toBe(lock.expires_at);
    });
  });
});
