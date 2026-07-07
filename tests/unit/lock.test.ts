import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  acquireLock,
  releaseLock,
  extendLock,
  getLockStatus,
} from "../../worker/lib/lock";
import type { Env } from "../../worker/types";
import { PipelineError } from "../../worker/types";

describe("Lock Mechanism (D1 CAS)", () => {
  let mockD1Storage: Map<string, Record<string, unknown>>;
  let mockEnv: Env;

  beforeEach(() => {
    mockD1Storage = new Map();

    const createMockBoundStatement = (
      sql: string,
      boundParams: unknown[] = [],
    ) => ({
      first: vi.fn(async () => {
        const row = mockD1Storage.get("pipeline:lock");
        if (!row) return null;
        if (
          sql.includes("SELECT") &&
          sql.includes("run_id") &&
          sql.includes("trace_id")
        ) {
          return {
            run_id: row.run_id,
            trace_id: row.trace_id,
            acquired_at: row.acquired_at,
            expires_at: row.expires_at,
          };
        }
        if (sql.includes("SELECT") && sql.includes("trace_id")) {
          return { trace_id: row.trace_id, expires_at: row.expires_at };
        }
        return null;
      }),
      run: vi.fn(async () => {
        const lockKey = "pipeline:lock";

        if (sql.includes("INSERT OR IGNORE")) {
          const existing = mockD1Storage.get(lockKey);
          if (!existing) {
            mockD1Storage.set(lockKey, {
              run_id: boundParams[1],
              trace_id: boundParams[2],
              acquired_at: boundParams[3],
              expires_at: boundParams[4],
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }

        if (sql.includes("UPDATE") && sql.includes("expires_at <")) {
          const existing = mockD1Storage.get(lockKey);
          if (existing) {
            const expiresAt = new Date(existing.expires_at as string);
            const now = new Date(boundParams[5] as string);
            if (expiresAt < now) {
              mockD1Storage.set(lockKey, {
                ...existing,
                run_id: boundParams[1],
                trace_id: boundParams[2],
                acquired_at: boundParams[3],
                expires_at: boundParams[4],
              });
              return { success: true, results: [], meta: { changes: 1 } };
            }
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }

        if (sql.includes("UPDATE") && sql.includes("SET expires_at")) {
          const existing = mockD1Storage.get(lockKey);
          if (existing && existing.trace_id === boundParams[2]) {
            mockD1Storage.set(lockKey, {
              ...existing,
              expires_at: boundParams[1],
            });
            return { success: true, results: [], meta: { changes: 1 } };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        }

        if (sql.includes("DELETE")) {
          const existing = mockD1Storage.get(lockKey);
          if (existing && existing.trace_id === boundParams[1]) {
            mockD1Storage.delete(lockKey);
          }
          return { success: true, results: [], meta: { changes: 1 } };
        }

        // All SELECT queries
        if (sql.includes("SELECT")) {
          const row = mockD1Storage.get(lockKey);
          if (!row) {
            return { success: true, results: [], meta: {} };
          }
          // getLockStatus SELECT: run_id, trace_id, expires_at
          if (
            sql.includes("run_id") &&
            sql.includes("trace_id") &&
            sql.includes("expires_at")
          ) {
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
          // releaseLock/extendLock SELECT: trace_id (and maybe expires_at)
          return {
            success: true,
            results: [{ trace_id: row.trace_id, expires_at: row.expires_at }],
            meta: {},
          };
        }

        return { success: true, results: [], meta: { changes: 0 } };
      }),
    });

    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      DEALS_DB: {
        prepare: vi.fn((sql: string) => {
          return {
            bind: (...params: unknown[]) =>
              createMockBoundStatement(sql, params),
          };
        }),
        batch: vi.fn(async (statements: unknown[]) => {
          const results = [];
          for (const stmt of statements) {
            const result = await (
              stmt as { run: () => Promise<unknown> }
            ).run();
            results.push(result);
          }
          return results;
        }),
      } as unknown as D1Database,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;
  });

  describe("acquireLock", () => {
    it("should acquire lock when no lock exists", async () => {
      const result = await acquireLock(mockEnv, "run-1", "trace-1");

      expect(result).toBe(true);
      expect(mockD1Storage.has("pipeline:lock")).toBe(true);
      const lock = mockD1Storage.get("pipeline:lock");
      expect(lock?.run_id).toBe("run-1");
      expect(lock?.trace_id).toBe("trace-1");
    });

    it("should acquire lock when existing lock is expired", async () => {
      const pastDate = new Date(Date.now() - 600000).toISOString();
      mockD1Storage.set("pipeline:lock", {
        run_id: "expired-run",
        trace_id: "expired-trace",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: pastDate,
      });

      const result = await acquireLock(mockEnv, "run-1", "trace-1");

      expect(result).toBe(true);
      const lock = mockD1Storage.get("pipeline:lock");
      expect(lock?.run_id).toBe("run-1");
    });

    it("should throw ConcurrencyError when lock is held", async () => {
      const futureDate = new Date(Date.now() + 600000).toISOString();
      mockD1Storage.set("pipeline:lock", {
        run_id: "existing-run",
        trace_id: "existing-trace",
        acquired_at: new Date().toISOString(),
        expires_at: futureDate,
      });

      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        PipelineError,
      );
      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        "Lock held by run existing-run",
      );
    });

    it("should throw ConcurrencyError on D1 failure", async () => {
      (mockEnv.DEALS_DB as unknown as { batch: any }).batch = vi.fn(
        async () => {
          throw new Error("D1 connection failed");
        },
      );

      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        PipelineError,
      );
      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        "Lock acquisition failed",
      );
    });

    it("should mark lock acquisition errors as retryable", async () => {
      (mockEnv.DEALS_DB as unknown as { batch: any }).batch = vi.fn(
        async () => {
          throw new Error("Transient error");
        },
      );

      try {
        await acquireLock(mockEnv, "run-1", "trace-1");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(true);
      }
    });
  });

  describe("releaseLock", () => {
    it("should release lock when held by same trace", async () => {
      mockD1Storage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await releaseLock(mockEnv, "trace-1");

      expect(mockD1Storage.has("pipeline:lock")).toBe(false);
    });

    it("should warn when no lock found", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await releaseLock(mockEnv, "trace-1");

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should warn when lock owned by different trace", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockD1Storage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "different-trace",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await releaseLock(mockEnv, "trace-1");

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should not throw on release error", async () => {
      (mockEnv.DEALS_DB as unknown as { batch: any }).batch = vi.fn(
        async () => {
          throw new Error("D1 error");
        },
      );

      mockD1Storage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await expect(releaseLock(mockEnv, "trace-1")).resolves.not.toThrow();
    });
  });

  describe("extendLock", () => {
    it("should extend lock when held by same trace", async () => {
      const originalExpiry = new Date(Date.now() + 60000).toISOString();
      mockD1Storage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: originalExpiry,
      });

      await extendLock(mockEnv, "trace-1", 300);

      const lock = mockD1Storage.get("pipeline:lock") as { expires_at: string };
      const newExpiry = new Date(lock.expires_at);
      expect(newExpiry.getTime()).toBeGreaterThan(
        new Date(originalExpiry).getTime(),
      );
    });

    it("should throw ConcurrencyError when lock not found", async () => {
      await expect(extendLock(mockEnv, "trace-1")).rejects.toThrow(
        PipelineError,
      );
      await expect(extendLock(mockEnv, "trace-1")).rejects.toThrow(
        "Cannot extend lock",
      );
    });

    it("should throw ConcurrencyError when lock owned by different trace", async () => {
      mockD1Storage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "different-trace",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await expect(extendLock(mockEnv, "trace-1")).rejects.toThrow(
        PipelineError,
      );
      await expect(extendLock(mockEnv, "trace-1")).rejects.toThrow(
        "not owned by current trace",
      );
    });

    it("should use default extension time", async () => {
      mockD1Storage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await extendLock(mockEnv, "trace-1");

      const lock = mockD1Storage.get("pipeline:lock") as { expires_at: string };
      const expiresAt = new Date(lock.expires_at);
      const expectedMin = new Date(Date.now() + 300000);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        expectedMin.getTime() - 1000,
      );
    });

    it("should mark extension errors as retryable", async () => {
      (mockEnv.DEALS_DB as unknown as { batch: any }).batch = vi.fn(
        async () => {
          throw new Error("D1 error");
        },
      );

      try {
        await extendLock(mockEnv, "trace-1");
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineError);
        expect((error as PipelineError).retryable).toBe(true);
      }
    });
  });

  describe("getLockStatus", () => {
    it("should return locked status when lock exists and is valid", async () => {
      const futureDate = new Date(Date.now() + 600000).toISOString();
      mockD1Storage.set("pipeline:lock", {
        run_id: "current-run",
        trace_id: "current-trace",
        acquired_at: new Date().toISOString(),
        expires_at: futureDate,
      });

      const status = await getLockStatus(mockEnv);

      expect(status.locked).toBe(true);
      expect(status.run_id).toBe("current-run");
      expect(status.trace_id).toBe("current-trace");
      expect(status.expires_at).toBe(futureDate);
    });

    it("should return unlocked when no lock exists", async () => {
      const status = await getLockStatus(mockEnv);

      expect(status.locked).toBe(false);
      expect(status.run_id).toBeUndefined();
      expect(status.trace_id).toBeUndefined();
    });

    it("should return unlocked when lock is expired", async () => {
      const pastDate = new Date(Date.now() - 600000).toISOString();
      mockD1Storage.set("pipeline:lock", {
        run_id: "expired-run",
        trace_id: "expired-trace",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: pastDate,
      });

      const status = await getLockStatus(mockEnv);

      expect(status.locked).toBe(false);
    });

    it("should handle D1 errors gracefully", async () => {
      (mockEnv.DEALS_DB as unknown as { prepare: any }).prepare = vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(async () => {
          throw new Error("D1 error");
        }),
      }));

      const status = await getLockStatus(mockEnv);

      expect(status.locked).toBe(false);
    });
  });

  describe("Lock expiration", () => {
    it("should set correct expiration time on acquire", async () => {
      const beforeAcquire = Date.now();
      await acquireLock(mockEnv, "run-1", "trace-1");
      const afterAcquire = Date.now();

      const lock = mockD1Storage.get("pipeline:lock") as {
        acquired_at: string;
        expires_at: string;
      };

      const acquiredAt = new Date(lock.acquired_at).getTime();
      const expiresAt = new Date(lock.expires_at).getTime();

      expect(acquiredAt).toBeGreaterThanOrEqual(beforeAcquire);
      expect(acquiredAt).toBeLessThanOrEqual(afterAcquire);
      expect(expiresAt - acquiredAt).toBe(300000); // 5 minutes in ms
    });

    it("should extend expiration correctly", async () => {
      mockD1Storage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      });

      const beforeExtend = Date.now();
      await extendLock(mockEnv, "trace-1", 600);
      const afterExtend = Date.now();

      const lock = mockD1Storage.get("pipeline:lock") as { expires_at: string };
      const expiresAt = new Date(lock.expires_at).getTime();
      const expectedMinExpiry = beforeExtend + 600000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry - 1000);
    });
  });
});
