import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  acquireLock,
  releaseLock,
  extendLock,
  getLockStatus,
} from "../../worker/lib/lock";
import type { Env } from "../../worker/types";
import { PipelineError } from "../../worker/types";

interface LockRow {
  lock_name: string;
  run_id: string;
  trace_id: string;
  acquired_at: string;
  expires_at: string;
}

/** In-memory D1 mock with SQL routing for pipeline_locks operations. */
function createMockD1(storage: Map<string, LockRow>) {
  const LOCK = "pipeline:lock";

  function stmt(sql: string, params: unknown[]) {
    return {
      first: vi.fn(async () => {
        const row = storage.get(LOCK);
        if (!row) return null;
        // getLockStatus: SELECT without acquired_at
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
        // acquireLock batch: SELECT with acquired_at
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
        // extendLock/releaseLock check
        if (sql.includes("SELECT") && sql.includes("trace_id")) {
          return { trace_id: row.trace_id, expires_at: row.expires_at };
        }
        return null;
      }),
      run: vi.fn(async () => {
        if (sql.includes("INSERT OR IGNORE")) {
          if (!storage.get(LOCK)) {
            storage.set(LOCK, {
              lock_name: LOCK,
              run_id: params[1] as string,
              trace_id: params[2] as string,
              acquired_at: params[3] as string,
              expires_at: params[4] as string,
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }
        if (sql.includes("UPDATE") && sql.includes("expires_at <")) {
          const existing = storage.get(LOCK);
          if (
            existing &&
            new Date(existing.expires_at) < new Date(params[5] as string)
          ) {
            storage.set(LOCK, {
              lock_name: LOCK,
              run_id: params[1] as string,
              trace_id: params[2] as string,
              acquired_at: params[3] as string,
              expires_at: params[4] as string,
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }
        if (sql.includes("UPDATE") && sql.includes("SET expires_at")) {
          const existing = storage.get(LOCK);
          if (existing && existing.trace_id === params[2]) {
            storage.set(LOCK, { ...existing, expires_at: params[1] as string });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }
        if (sql.includes("DELETE")) {
          const existing = storage.get(LOCK);
          if (existing && existing.trace_id === params[1]) storage.delete(LOCK);
          return { success: true, results: [], meta: { changes: 1 } };
        }
        if (sql.includes("SELECT")) {
          const row = storage.get(LOCK);
          if (!row) return { success: true, results: [], meta: {} };
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

  return {
    prepare: vi.fn((sql: string) => ({
      bind: (...p: unknown[]) => stmt(sql, p),
    })),
    batch: vi.fn(async (statements: unknown[]) => {
      const results = [];
      for (const s of statements)
        results.push(await (s as { run: () => Promise<unknown> }).run());
      return results;
    }),
  } as unknown as D1Database;
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

describe("PipelineLock — expiry, lifecycle, metadata", () => {
  let storage: Map<string, LockRow>;
  let db: D1Database;
  let env: Env;

  beforeEach(() => {
    storage = new Map();
    db = createMockD1(storage);
    env = createMockEnv(db);
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
