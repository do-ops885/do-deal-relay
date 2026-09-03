import { describe, it, expect, vi, beforeEach } from "vitest";
import { acquireLock, releaseLock, getLockStatus } from "../../worker/lib/lock";
import type { Env } from "../../worker/types";
import { PipelineError } from "../../worker/types";
import { createMockD1, type LockRow } from "../fixtures/d1-mock";

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

describe("PipelineLock — acquire, concurrent, release, error resilience", () => {
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
});
