/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  callWithCircuitBreaker,
  getCircuitBreakerMetrics,
  resetCircuitBreaker,
  clearSourceCircuitBreakers,
  getAllCircuitBreakerMetrics,
  resetAllMetrics,
} from "../../worker/lib/circuit-breaker";
import type { Env } from "../../worker/types";

describe("Circuit Breaker", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map();
    resetAllMetrics();
    clearSourceCircuitBreakers();
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});

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
        expect(allMetrics["cb1"]!.successfulCalls).toBe(1);
        expect(allMetrics["cb2"]!.failedCalls).toBe(1);
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
});
