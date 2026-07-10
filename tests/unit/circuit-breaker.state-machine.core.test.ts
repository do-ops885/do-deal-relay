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

describe("Circuit Breaker - State Machine", () => {
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

  describe("CircuitBreaker class", () => {
    describe("constructor and initialization", () => {
      it("should create circuit breaker with default options", async () => {
        const cb = new CircuitBreaker("test-cb");

        expect(cb).toBeInstanceOf(CircuitBreaker);
        await expect(cb.getState()).resolves.toBe("closed");
      });

      it("should create circuit breaker with custom options", () => {
        const cb = new CircuitBreaker("test-cb", {
          failureThreshold: 10,
          resetTimeoutMs: 60000,
          halfOpenMaxCalls: 5,
        });

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should create circuit breaker with environment", () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });
    });

    describe("CLOSED state - normal operation", () => {
      it("should execute successful calls in closed state", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const fn = vi.fn().mockResolvedValue("success");

        const result = await cb.execute(fn);

        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(1);
        expect(await cb.getState()).toBe("closed");
      });

      it("should track successful calls in metrics", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const fn = vi.fn().mockResolvedValue("success");

        await cb.execute(fn);
        await cb.execute(fn);

        const metrics = cb.getMetrics();
        expect(metrics.totalCalls).toBe(2);
        expect(metrics.successfulCalls).toBe(2);
        expect(metrics.failedCalls).toBe(0);
        expect(metrics.rejectedCalls).toBe(0);
      });

      it("should count failures in closed state", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        const metrics = cb.getMetrics();
        expect(metrics.totalCalls).toBe(1);
        expect(metrics.failedCalls).toBe(1);
        expect(metrics.successfulCalls).toBe(0);
      });

      it("should reset failures on success in closed state", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const failFn = vi.fn().mockRejectedValue(new Error("failure"));
        const successFn = vi.fn().mockResolvedValue("success");

        // 2 failures
        try {
          await cb.execute(failFn);
        } catch {
          // expected
        }
        try {
          await cb.execute(failFn);
        } catch {
          // expected
        }

        // 1 success should reset failure count
        await cb.execute(successFn);

        // Now more failures - should not trip immediately since failures reset
        const failFn2 = vi.fn().mockRejectedValue(new Error("failure"));

        // Need 5 more failures to trip
        for (let i = 0; i < 5; i++) {
          try {
            await cb.execute(failFn2);
          } catch {
            // expected
          }
        }

        expect(await cb.getState()).toBe("open");
      });
    });

    describe("State transition: CLOSED → OPEN after threshold", () => {
      it("should transition to open after reaching failure threshold", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 3 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        expect(await cb.getState()).toBe("closed");

        // 2 failures - still closed
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }
        expect(await cb.getState()).toBe("closed");

        // 3rd failure - transitions to open
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        expect(await cb.getState()).toBe("open");
      });

      it("should track state change when transitioning to open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        const metrics = cb.getMetrics();
        expect(metrics.stateChanges).toBe(1);
        expect(metrics.lastStateChange).toContain("closed → open");
      });

      it("should track state changes in metrics", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        const metrics = cb.getMetrics();
        expect(metrics.stateChanges).toBe(1);
        expect(metrics.lastStateChange).toContain("closed → open");
      });

      it("should use default failure threshold of 5", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // 4 failures - still closed
        for (let i = 0; i < 4; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }
        expect(await cb.getState()).toBe("closed");

        // 5th failure - opens
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        expect(await cb.getState()).toBe("open");
      });
    });

    describe("OPEN state - rejecting calls", () => {
      it("should reject calls when circuit is open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        // Next call should be rejected
        const successFn = vi.fn().mockResolvedValue("success");

        await expect(cb.execute(successFn)).rejects.toThrow(
          CircuitBreakerOpenError,
        );
        await expect(cb.execute(successFn)).rejects.toThrow("is OPEN");

        // Success function should not have been called
        expect(successFn).not.toHaveBeenCalled();
      });

      it("should track rejected calls in metrics", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        // Rejected call
        try {
          await cb.execute(vi.fn().mockResolvedValue("success"));
        } catch {
          // expected
        }

        const metrics = cb.getMetrics();
        expect(metrics.rejectedCalls).toBe(1);
        expect(metrics.totalCalls).toBe(2); // 1 failed + 1 rejected
      });

      it("should include retry time in open circuit error", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 60000 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        // Advance time a bit
        vi.advanceTimersByTime(10000);

        try {
          await cb.execute(vi.fn().mockResolvedValue("success"));
        } catch (error) {
          expect(error).toBeInstanceOf(CircuitBreakerOpenError);
          expect((error as Error).message).toMatch(/Retry after \d+s/);
        }
      });
    });

    describe("State transition: OPEN → HALF-OPEN after timeout", () => {
      it("should transition to half-open after reset timeout", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        expect(await cb.getState()).toBe("open");

        // Advance time past reset timeout
        vi.advanceTimersByTime(30000);

        // Next call should transition to half-open
        const successFn = vi.fn().mockResolvedValue("success");
        await cb.execute(successFn);

        expect(await cb.getState()).toBe("half-open");
      });

      it("should track state change when transitioning to half-open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        await cb.execute(vi.fn().mockResolvedValue("success"));

        const metrics = cb.getMetrics();
        expect(metrics.lastStateChange).toContain("open → half-open");
      });

      it("should use default reset timeout of 30 seconds", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open the circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }

        // Just before 30 seconds - still open
        vi.advanceTimersByTime(29999);
        await expect(
          cb.execute(vi.fn().mockResolvedValue("success")),
        ).rejects.toThrow(CircuitBreakerOpenError);

        // At 30 seconds - transitions to half-open
        vi.advanceTimersByTime(1);
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });
    });
  });
});
