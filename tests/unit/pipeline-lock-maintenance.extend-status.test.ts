import { describe, it, expect, vi, beforeEach } from "vitest";
import { acquireLock, extendLock, getLockStatus } from "../../worker/lib/lock";
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

describe("PipelineLock — extend & status", () => {
  let storage: Map<string, LockRow>;
  let db: D1Database;
  let env: Env;

  beforeEach(() => {
    storage = new Map();
    db = createMockD1(storage);
    env = createMockEnv(db);
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
});
