/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  createCircuitBreaker,
  callWithCircuitBreaker,
  getCircuitBreakerMetrics,
  resetCircuitBreaker,
  createGitHubCircuitBreaker,
  createTelegramCircuitBreaker,
  getSourceCircuitBreaker,
  clearSourceCircuitBreakers,
  getAllCircuitBreakerMetrics,
  resetAllMetrics,
  type CircuitState,
} from "../../worker/lib/circuit-breaker";
import type { Env } from "../../worker/types";

describe("Circuit Breaker", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockKvStorage = new Map();
    resetAllMetrics();
    clearSourceCircuitBreakers();
    vi.useFakeTimers();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockEnv = {
      DEALS_PROD: {
        get: vi.fn(async <T>(key: string, type?: string) => {
          const value = mockKvStorage.get(key);
          if (type === "json" && typeof value === "string") {
            return JSON.parse(value) as T;
          }
          return value as T;
        }),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(key, JSON.parse(value));
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(key);
        }),
        list: vi.fn(async () => ({ keys: [], list_complete: true })),
      } as unknown as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {} as KVNamespace,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  describe("Full state transition cycle", () => {
    it("should complete full cycle: closed → open → half-open → closed", async () => {
      const cb = new CircuitBreaker(
        "test-cb",
        {
          failureThreshold: 3,
          resetTimeoutMs: 10000,
          halfOpenMaxCalls: 2,
        },
        mockEnv,
      );

      const failFn = vi.fn().mockRejectedValue(new Error("failure"));
      const successFn = vi.fn().mockResolvedValue("success");

      // Start: CLOSED
      expect(await cb.getState()).toBe("closed");

      // 3 failures → OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await cb.execute(failFn);
        } catch {
          // expected
        }
      }
      expect(await cb.getState()).toBe("open");

      // Calls rejected in OPEN
      await expect(cb.execute(successFn)).rejects.toThrow(
        CircuitBreakerOpenError,
      );

      // After timeout → HALF-OPEN
      vi.advanceTimersByTime(10000);
      await cb.execute(successFn);
      expect(await cb.getState()).toBe("half-open");

      // Second success → CLOSED
      await cb.execute(successFn);
      expect(await cb.getState()).toBe("closed");

      // Normal operation
      await cb.execute(successFn);
      await cb.execute(successFn);
      expect(await cb.getState()).toBe("closed");

      // Verify metrics
      const metrics = cb.getMetrics();
      expect(metrics.totalCalls).toBe(8); // 3 failures + 1 rejected + 2 to close + 2 normal
      expect(metrics.successfulCalls).toBe(4);
      expect(metrics.failedCalls).toBe(3);
      expect(metrics.rejectedCalls).toBe(1);
      expect(metrics.stateChanges).toBe(3); // closed→open, open→half-open, half-open→closed
    });

    it("should complete cycle with half-open failure: closed → open → half-open → open", async () => {
      const cb = new CircuitBreaker(
        "test-cb",
        {
          failureThreshold: 2,
          resetTimeoutMs: 5000,
          halfOpenMaxCalls: 3,
        },
        mockEnv,
      );

      const failFn = vi.fn().mockRejectedValue(new Error("failure"));
      const successFn = vi.fn().mockResolvedValue("success");

      // 2 failures → OPEN
      for (let i = 0; i < 2; i++) {
        try {
          await cb.execute(failFn);
        } catch {
          // expected
        }
      }
      expect(await cb.getState()).toBe("open");

      // After timeout → HALF-OPEN
      vi.advanceTimersByTime(5000);
      await cb.execute(successFn);
      expect(await cb.getState()).toBe("half-open");

      // Failure in half-open → OPEN
      try {
        await cb.execute(failFn);
      } catch {
        // expected
      }
      expect(await cb.getState()).toBe("open");

      // Verify state changes
      const metrics = cb.getMetrics();
      expect(metrics.stateChanges).toBe(3); // closed→open, open→half-open, half-open→open
    });
  });

  describe("Multiple circuit breakers", () => {
    it("should maintain separate state for different circuit breakers", async () => {
      const cb1 = new CircuitBreaker("cb1", { failureThreshold: 2 }, mockEnv);
      const cb2 = new CircuitBreaker("cb2", { failureThreshold: 5 }, mockEnv);

      const failFn = vi.fn().mockRejectedValue(new Error("failure"));

      // Open cb1 with 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await cb1.execute(failFn);
        } catch {
          // expected
        }
      }

      expect(await cb1.getState()).toBe("open");
      expect(await cb2.getState()).toBe("closed");
    });

    it("should maintain separate metrics for different circuit breakers", async () => {
      const cb1 = new CircuitBreaker("cb1", {}, mockEnv);
      const cb2 = new CircuitBreaker("cb2", {}, mockEnv);

      await cb1.execute(vi.fn().mockResolvedValue("success"));
      await cb1.execute(vi.fn().mockResolvedValue("success"));
      await cb2.execute(vi.fn().mockResolvedValue("success"));

      const metrics1 = cb1.getMetrics();
      const metrics2 = cb2.getMetrics();

      expect(metrics1.totalCalls).toBe(2);
      expect(metrics2.totalCalls).toBe(1);
    });
  });
});
