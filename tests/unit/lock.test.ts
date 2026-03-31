import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  acquireLock,
  releaseLock,
  extendLock,
  getLockStatus,
} from "../../worker/lib/lock";
import type { Env } from "../../worker/types";
import { PipelineError } from "../../worker/types";

describe("Lock Mechanism", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();

    mockEnv = {
      DEALS_PROD: {} as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(key);
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(
          async (
            key: string,
            value: string,
            options?: { expirationTtl?: number },
          ) => {
            mockKvStorage.set(key, JSON.parse(value));
          },
        ),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(key);
        }),
      } as unknown as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  describe("acquireLock", () => {
    it("should acquire lock when no lock exists", async () => {
      const result = await acquireLock(mockEnv, "run-1", "trace-1");

      expect(result).toBe(true);
      expect(mockEnv.DEALS_LOCK.put).toHaveBeenCalledWith(
        "pipeline:lock",
        expect.any(String),
        expect.objectContaining({ expirationTtl: 300 }),
      );
    });

    it("should acquire lock when existing lock is expired", async () => {
      const pastDate = new Date(Date.now() - 600000).toISOString();
      mockKvStorage.set("pipeline:lock", {
        run_id: "expired-run",
        trace_id: "expired-trace",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: pastDate,
      });

      const result = await acquireLock(mockEnv, "run-1", "trace-1");

      expect(result).toBe(true);
    });

    it("should throw ConcurrencyError when lock is held", async () => {
      const futureDate = new Date(Date.now() + 600000).toISOString();
      mockKvStorage.set("pipeline:lock", {
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

    it("should verify lock was acquired", async () => {
      // Mock the get to return different values on different calls
      let getCallCount = 0;
      mockEnv.DEALS_LOCK.get = vi.fn(async () => {
        getCallCount++;
        if (getCallCount === 1) {
          return null; // First check - no existing lock
        }
        return {
          run_id: "run-1",
          trace_id: "trace-1",
          acquired_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 300000).toISOString(),
        };
      });

      const result = await acquireLock(mockEnv, "run-1", "trace-1");

      expect(result).toBe(true);
    });

    it("should throw when verification fails", async () => {
      // Mock get to always return null (lock wasn't actually stored)
      mockEnv.DEALS_LOCK.get = vi.fn(async () => null);

      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        PipelineError,
      );
      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        "Failed to verify lock acquisition",
      );
    });

    it("should throw ConcurrencyError on KV failure", async () => {
      mockEnv.DEALS_LOCK.get = vi.fn(async () => {
        throw new Error("KV connection failed");
      });

      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        PipelineError,
      );
      await expect(acquireLock(mockEnv, "run-1", "trace-1")).rejects.toThrow(
        "Lock acquisition failed",
      );
    });

    it("should mark lock acquisition errors as retryable", async () => {
      mockEnv.DEALS_LOCK.get = vi.fn(async () => {
        throw new Error("Transient error");
      });

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
      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await releaseLock(mockEnv, "trace-1");

      expect(mockEnv.DEALS_LOCK.delete).toHaveBeenCalledWith("pipeline:lock");
    });

    it("should warn when no lock found", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await releaseLock(mockEnv, "trace-1");

      expect(consoleSpy).toHaveBeenCalledWith(
        "No active lock found during release",
      );
      consoleSpy.mockRestore();
    });

    it("should warn when lock owned by different trace", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "different-trace",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await releaseLock(mockEnv, "trace-1");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Lock owned by different-trace"),
      );
      consoleSpy.mockRestore();
    });

    it("should not throw on release error", async () => {
      mockEnv.DEALS_LOCK.delete = vi.fn(async () => {
        throw new Error("KV error");
      });

      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      // Should not throw
      await expect(releaseLock(mockEnv, "trace-1")).resolves.not.toThrow();
    });

    it("should log error on release failure", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockEnv.DEALS_LOCK.delete = vi.fn(async () => {
        throw new Error("Delete failed");
      });

      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await releaseLock(mockEnv, "trace-1");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to release lock:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("extendLock", () => {
    it("should extend lock when held by same trace", async () => {
      const originalExpiry = new Date(Date.now() + 60000).toISOString();
      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: originalExpiry,
      });

      await extendLock(mockEnv, "trace-1", 300);

      expect(mockEnv.DEALS_LOCK.put).toHaveBeenCalledWith(
        "pipeline:lock",
        expect.stringContaining("trace-1"),
        expect.objectContaining({ expirationTtl: 300 }),
      );
    });

    it("should update expiration time", async () => {
      const oldExpiry = new Date(Date.now() + 60000).toISOString();
      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: oldExpiry,
      });

      await extendLock(mockEnv, "trace-1", 600);

      const stored = mockKvStorage.get("pipeline:lock") as {
        expires_at: string;
      };
      const newExpiry = new Date(stored.expires_at);
      const expectedExpiry = new Date(Date.now() + 600000);

      expect(newExpiry.getTime()).toBeGreaterThan(
        new Date(oldExpiry).getTime(),
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
      mockKvStorage.set("pipeline:lock", {
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
      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });

      await extendLock(mockEnv, "trace-1");

      expect(mockEnv.DEALS_LOCK.put).toHaveBeenCalledWith(
        "pipeline:lock",
        expect.any(String),
        expect.objectContaining({ expirationTtl: 300 }),
      );
    });

    it("should mark extension errors as retryable", async () => {
      mockEnv.DEALS_LOCK.get = vi.fn(async () => {
        throw new Error("KV error");
      });

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
      mockKvStorage.set("pipeline:lock", {
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
      mockKvStorage.set("pipeline:lock", {
        run_id: "expired-run",
        trace_id: "expired-trace",
        acquired_at: "2024-01-01T00:00:00Z",
        expires_at: pastDate,
      });

      const status = await getLockStatus(mockEnv);

      expect(status.locked).toBe(false);
    });

    it("should handle KV errors gracefully", async () => {
      mockEnv.DEALS_LOCK.get = vi.fn(async () => {
        throw new Error("KV error");
      });

      const status = await getLockStatus(mockEnv);

      expect(status.locked).toBe(false);
    });
  });

  describe("Lock expiration", () => {
    it("should set correct expiration time on acquire", async () => {
      const beforeAcquire = Date.now();
      await acquireLock(mockEnv, "run-1", "trace-1");
      const afterAcquire = Date.now();

      const lock = mockKvStorage.get("pipeline:lock") as {
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
      mockKvStorage.set("pipeline:lock", {
        run_id: "run-1",
        trace_id: "trace-1",
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      });

      const beforeExtend = Date.now();
      await extendLock(mockEnv, "trace-1", 600);
      const afterExtend = Date.now();

      const lock = mockKvStorage.get("pipeline:lock") as { expires_at: string };
      const expiresAt = new Date(lock.expires_at).getTime();
      const expectedMinExpiry = beforeExtend + 600000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry - 1000); // Allow 1s variance
    });
  });
});
