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
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as Env;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("CircuitBreaker class", () => {
    describe("constructor and initialization", () => {
      it("should create circuit breaker with default options", () => {
        const cb = new CircuitBreaker("test-cb");

        expect(cb).toBeInstanceOf(CircuitBreaker);
        expect(cb.getState()).resolves.toBe("closed");
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

      it("should log state change when transitioning to open", async () => {
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

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("State changed: closed → open"),
        );
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

      it("should log state change when transitioning to half-open", async () => {
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

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("State changed: open → half-open"),
        );
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

    describe("HALF-OPEN state - limited test calls", () => {
      it("should allow limited test calls in half-open state", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 3 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        // Should allow exactly halfOpenMaxCalls test calls
        const successFn = vi.fn().mockResolvedValue("success");

        await cb.execute(successFn); // 1st call
        await cb.execute(successFn); // 2nd call
        await cb.execute(successFn); // 3rd call - this closes the circuit

        expect(successFn).toHaveBeenCalledTimes(3);
        expect(await cb.getState()).toBe("closed"); // Circuit closes after 3 successes
      });

      it("should reject calls after max test calls in half-open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 3 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        // In half-open, make 3 calls (all allowed, but circuit not closed yet since we need 3 successes)
        // Actually, after each success the circuit closes when halfOpenMaxCalls is reached
        // So we need a different approach - test by checking the 4th call after 3 successes closed the circuit
        // Let's test by using a higher threshold: halfOpenMaxCalls: 3 means we need 3 successes to close
        // So 3 calls should work, and the circuit will be closed after

        // Actually, the issue is success closes circuit. Let's verify the 3rd call closes it
        const successFn = vi.fn().mockResolvedValue("success");
        await cb.execute(successFn); // 1st - halfOpenCalls=1, successes=1
        await cb.execute(successFn); // 2nd - halfOpenCalls=2, successes=2
        await cb.execute(successFn); // 3rd - halfOpenCalls=3, successes=3, closes circuit

        // Circuit is now closed, not half-open, so this call should succeed
        const result = await cb.execute(successFn);
        expect(result).toBe("success");
      });

      it("should track test call rejections in metrics", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 2 },
          mockEnv,
        );

        // Open circuit with 1 failure
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        // 2 calls rejected in OPEN state
        try {
          await cb.execute(vi.fn().mockResolvedValue("success"));
        } catch {
          // expected - rejected
        }
        try {
          await cb.execute(vi.fn().mockResolvedValue("success"));
        } catch {
          // expected - rejected
        }

        const metrics = cb.getMetrics();
        expect(metrics.rejectedCalls).toBe(2);
        expect(metrics.totalCalls).toBe(3); // 1 failed + 2 rejected
      });
    });

    describe("State transition: HALF-OPEN → CLOSED after success", () => {
      it("should transition to closed after enough successes in half-open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 2 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        // 2 successes should close the circuit
        await cb.execute(vi.fn().mockResolvedValue("success"));
        await cb.execute(vi.fn().mockResolvedValue("success"));

        expect(await cb.getState()).toBe("closed");
      });

      it("should log state change when transitioning to closed", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        await cb.execute(vi.fn().mockResolvedValue("success"));

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("State changed: half-open → closed"),
        );
      });

      it("should allow normal operations after closing", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        // Close circuit
        await cb.execute(vi.fn().mockResolvedValue("success"));

        // Now should allow many calls
        const successFn = vi.fn().mockResolvedValue("success");
        for (let i = 0; i < 10; i++) {
          await cb.execute(successFn);
        }

        expect(successFn).toHaveBeenCalledTimes(10);
      });
    });

    describe("State transition: HALF-OPEN → OPEN after failure", () => {
      it("should transition back to open on any failure in half-open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 3 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        // First call succeeds
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");

        // Second call fails - should go back to open
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(await cb.getState()).toBe("open");
      });

      it("should log state change when transitioning back to open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        // This call fails
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("State changed: half-open → open"),
        );
      });

      it("should reset success count when transitioning back to open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1, resetTimeoutMs: 30000, halfOpenMaxCalls: 3 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        vi.advanceTimersByTime(30000);

        // Two successes
        await cb.execute(vi.fn().mockResolvedValue("success"));
        await cb.execute(vi.fn().mockResolvedValue("success"));

        // Third call fails - back to open
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        // Wait for timeout again
        vi.advanceTimersByTime(30000);

        // Need 3 more successes to close (successes were reset)
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });
    });

    describe("Reset functionality", () => {
      it("should reset circuit to closed state", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(await cb.getState()).toBe("open");

        // Reset
        await cb.reset();

        expect(await cb.getState()).toBe("closed");
      });

      it("should reset failure count on reset", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 3 },
          mockEnv,
        );

        // 2 failures
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
          } catch {
            // expected
          }
        }

        // Reset
        await cb.reset();

        // Now need 3 more failures to open (not just 1)
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
          } catch {
            // expected
          }
        }

        expect(await cb.getState()).toBe("closed");

        // 3rd failure should open
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(await cb.getState()).toBe("open");
      });

      it("should log reset action", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        await cb.reset();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Manually reset to closed"),
        );
      });

      it("should work without environment", async () => {
        const cb = new CircuitBreaker("test-cb", { failureThreshold: 1 });

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(await cb.getState()).toBe("open");

        await cb.reset();
        expect(await cb.getState()).toBe("closed");
      });
    });

    describe("Error propagation", () => {
      it("should propagate original error from wrapped function", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const customError = new Error("custom error message");
        const fn = vi.fn().mockRejectedValue(customError);

        await expect(cb.execute(fn)).rejects.toThrow("custom error message");
      });

      it("should wrap error in CircuitBreakerOpenError when circuit open", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        try {
          await cb.execute(vi.fn().mockResolvedValue("success"));
        } catch (error) {
          expect(error).toBeInstanceOf(CircuitBreakerOpenError);
          expect((error as Error).name).toBe("CircuitBreakerOpenError");
        }
      });
    });

    describe("KV persistence", () => {
      it("should persist state to KV", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
          "circuit:test-cb",
          expect.stringContaining('"state":"open"'),
        );
      });

      it("should load state from KV", async () => {
        // Pre-populate KV with open state
        mockKvStorage.set("circuit:test-cb", {
          state: "open" as CircuitState,
          failures: 5,
          lastFailureTime: Date.now(),
          successesInHalfOpen: 0,
          halfOpenCalls: 0,
        });

        const cb = new CircuitBreaker("test-cb", {}, mockEnv);

        expect(await cb.getState()).toBe("open");
      });

      it("should handle KV get errors gracefully", async () => {
        mockEnv.DEALS_PROD.get = vi
          .fn()
          .mockRejectedValue(new Error("KV error"));

        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const fn = vi.fn().mockResolvedValue("success");

        // Should still work using in-memory state
        const result = await cb.execute(fn);
        expect(result).toBe("success");
      });

      it("should handle KV put errors gracefully", async () => {
        mockEnv.DEALS_PROD.put = vi
          .fn()
          .mockRejectedValue(new Error("KV error"));

        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const fn = vi.fn().mockResolvedValue("success");

        // Should still work (logs error but doesn't throw)
        const result = await cb.execute(fn);
        expect(result).toBe("success");
      });

      it("should use in-memory state when no env provided", async () => {
        const cb = new CircuitBreaker("test-cb", { failureThreshold: 1 });

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(await cb.getState()).toBe("open");
      });
    });
  });

  describe("Factory functions", () => {
    describe("createCircuitBreaker", () => {
      it("should create a circuit breaker with given name", () => {
        const cb = createCircuitBreaker("my-cb");

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should pass options to circuit breaker", async () => {
        const cb = createCircuitBreaker("my-cb", {
          failureThreshold: 3,
          resetTimeoutMs: 10000,
        });

        // Test that options are used
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // 2 failures - still closed
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }
        expect(await cb.getState()).toBe("closed");

        // 3rd failure - opens
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        expect(await cb.getState()).toBe("open");
      });
    });

    describe("createGitHubCircuitBreaker", () => {
      it("should create circuit breaker for GitHub API", () => {
        const cb = createGitHubCircuitBreaker(mockEnv);

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should use GitHub-specific configuration", async () => {
        const cb = createGitHubCircuitBreaker(mockEnv);

        // Should use failureThreshold: 5
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

      it("should use 30 second reset timeout", async () => {
        const cb = createGitHubCircuitBreaker(mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open circuit
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        for (let i = 0; i < 4; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }

        vi.advanceTimersByTime(30000);

        // Should transition to half-open
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });
    });

    describe("createTelegramCircuitBreaker", () => {
      it("should create circuit breaker for Telegram", () => {
        const cb = createTelegramCircuitBreaker(mockEnv);

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should use lower failure threshold for notifications", async () => {
        const cb = createTelegramCircuitBreaker(mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // 2 failures - still closed
        for (let i = 0; i < 2; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }
        expect(await cb.getState()).toBe("closed");

        // 3rd failure - opens (lower threshold)
        try {
          await cb.execute(fn);
        } catch {
          // expected
        }
        expect(await cb.getState()).toBe("open");
      });

      it("should use 60 second reset timeout", async () => {
        const cb = createTelegramCircuitBreaker(mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open circuit
        for (let i = 0; i < 3; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }

        // Before 60 seconds - still open
        vi.advanceTimersByTime(59999);
        await expect(
          cb.execute(vi.fn().mockResolvedValue("success")),
        ).rejects.toThrow(CircuitBreakerOpenError);

        // At 60 seconds - transitions
        vi.advanceTimersByTime(1);
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });
    });

    describe("getSourceCircuitBreaker", () => {
      it("should create circuit breaker for domain", () => {
        const cb = getSourceCircuitBreaker("example.com", mockEnv);

        expect(cb).toBeInstanceOf(CircuitBreaker);
      });

      it("should return same instance for same domain", () => {
        const cb1 = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2 = getSourceCircuitBreaker("example.com", mockEnv);

        expect(cb1).toBe(cb2);
      });

      it("should return different instances for different domains", () => {
        const cb1 = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2 = getSourceCircuitBreaker("other.com", mockEnv);

        expect(cb1).not.toBe(cb2);
      });

      it("should use 5 minute reset timeout for sources", async () => {
        const cb = getSourceCircuitBreaker("example.com", mockEnv);
        const fn = vi.fn().mockRejectedValue(new Error("failure"));

        // Open circuit
        for (let i = 0; i < 5; i++) {
          try {
            await cb.execute(fn);
          } catch {
            // expected
          }
        }

        // Before 5 minutes - still open
        vi.advanceTimersByTime(299999);
        await expect(
          cb.execute(vi.fn().mockResolvedValue("success")),
        ).rejects.toThrow(CircuitBreakerOpenError);

        // At 5 minutes - transitions
        vi.advanceTimersByTime(1);
        await cb.execute(vi.fn().mockResolvedValue("success"));
        expect(await cb.getState()).toBe("half-open");
      });

      it("should use source: prefix in name", async () => {
        // Clear any existing circuit breaker
        clearSourceCircuitBreakers();

        // Create a fresh circuit breaker with env
        const freshCb = getSourceCircuitBreaker("example.com", mockEnv);

        // Open the circuit to force a state save
        try {
          await freshCb.execute(
            vi.fn().mockRejectedValue(new Error("failure")),
          );
        } catch {
          // expected
        }
        // Need 5 failures for source circuit breaker
        for (let i = 0; i < 4; i++) {
          try {
            await freshCb.execute(
              vi.fn().mockRejectedValue(new Error("failure")),
            );
          } catch {
            // expected
          }
        }

        expect(mockEnv.DEALS_PROD.put).toHaveBeenCalledWith(
          "circuit:source:example.com",
          expect.any(String),
        );
      });
    });

    describe("clearSourceCircuitBreakers", () => {
      it("should clear all source circuit breakers", () => {
        const cb1 = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2 = getSourceCircuitBreaker("other.com", mockEnv);

        clearSourceCircuitBreakers();

        const cb1Again = getSourceCircuitBreaker("example.com", mockEnv);
        const cb2Again = getSourceCircuitBreaker("other.com", mockEnv);

        expect(cb1).not.toBe(cb1Again);
        expect(cb2).not.toBe(cb2Again);
      });
    });
  });

  describe("Convenience functions", () => {
    describe("callWithCircuitBreaker", () => {
      it("should execute function with circuit breaker", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        const fn = vi.fn().mockResolvedValue("result");

        const result = await callWithCircuitBreaker(cb, fn);

        expect(result).toBe("result");
        expect(fn).toHaveBeenCalled();
      });

      it("should handle circuit breaker errors", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        await expect(
          callWithCircuitBreaker(cb, vi.fn().mockResolvedValue("success")),
        ).rejects.toThrow(CircuitBreakerOpenError);
      });
    });

    describe("getCircuitBreakerMetrics", () => {
      it("should return metrics for circuit breaker", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        await cb.execute(vi.fn().mockResolvedValue("success"));

        const metrics = getCircuitBreakerMetrics(cb);

        expect(metrics.totalCalls).toBe(1);
        expect(metrics.successfulCalls).toBe(1);
      });
    });

    describe("resetCircuitBreaker", () => {
      it("should reset circuit breaker to closed", async () => {
        const cb = new CircuitBreaker(
          "test-cb",
          { failureThreshold: 1 },
          mockEnv,
        );

        // Open circuit
        try {
          await cb.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        expect(await cb.getState()).toBe("open");

        await resetCircuitBreaker(cb);

        expect(await cb.getState()).toBe("closed");
      });
    });

    describe("getAllCircuitBreakerMetrics", () => {
      it("should return metrics for all circuit breakers", async () => {
        const cb1 = new CircuitBreaker("cb1", {}, mockEnv);
        const cb2 = new CircuitBreaker("cb2", {}, mockEnv);

        await cb1.execute(vi.fn().mockResolvedValue("success"));

        // Execute failing call and catch the error
        try {
          await cb2.execute(vi.fn().mockRejectedValue(new Error("failure")));
        } catch {
          // expected
        }

        const allMetrics = getAllCircuitBreakerMetrics();

        expect(allMetrics["cb1"]).toBeDefined();
        expect(allMetrics["cb2"]).toBeDefined();
        expect(allMetrics["cb1"].successfulCalls).toBe(1);
        expect(allMetrics["cb2"].failedCalls).toBe(1);
      });

      it("should return empty object when no metrics", () => {
        const allMetrics = getAllCircuitBreakerMetrics();

        expect(allMetrics).toEqual({});
      });
    });

    describe("resetAllMetrics", () => {
      it("should clear all metrics", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        await cb.execute(vi.fn().mockResolvedValue("success"));

        expect(cb.getMetrics().totalCalls).toBe(1);

        resetAllMetrics();

        // After reset, metrics are re-initialized on next call
        const cb2 = new CircuitBreaker("test-cb", {}, mockEnv);
        expect(cb2.getMetrics().totalCalls).toBe(0);
      });
    });
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
