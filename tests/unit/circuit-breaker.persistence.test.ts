/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  clearSourceCircuitBreakers,
  resetAllMetrics,
  type CircuitState,
} from "../../worker/lib/circuit-breaker";
import type { Env } from "../../worker/types";

describe("Circuit Breaker - Persistence & Error Handling", () => {
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

      it("should log reset action via structured logger", async () => {
        const cb = new CircuitBreaker("test-cb", {}, mockEnv);
        await cb.reset();

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            '"message":"Circuit breaker \\"test-cb\\" manually reset to closed"',
          ),
        );
        expect(await cb.getState()).toBe("closed");
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
});
