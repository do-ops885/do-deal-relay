import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../worker/types";

describe("KV Isolation Validation", () => {
  let mockKV: any;
  let validEnv: any;

  beforeEach(() => {
    // Reset the module-level cache by using a hack or just relying on isolate-per-test if vitest allows
    // In this case, we might need to be careful if vitest shares the module state.
    // Let's assume for these tests we want to test the logic.

    mockKV = {
      get: vi.fn(),
    };

    validEnv = {
      DEALS_PROD: mockKV,
      DEALS_STAGING: mockKV,
      DEALS_LOG: mockKV,
      DEALS_LOCK: mockKV,
      DEALS_SOURCES: mockKV,
      ENVIRONMENT: "production",
    } as unknown as Env;

    vi.resetModules();
  });

  it("should pass if all KVs match the environment", async () => {
    mockKV.get.mockResolvedValue("production");

    // We need to re-import to get fresh state if we want to bypass the cache
    const { validateKVIsolation } =
      await import("../../worker/lib/config-utils");
    await expect(validateKVIsolation(validEnv)).resolves.not.toThrow();
  });

  it("should pass if KVs have no environment tag (backward compatibility)", async () => {
    mockKV.get.mockResolvedValue(null);

    const { validateKVIsolation } =
      await import("../../worker/lib/config-utils");
    await expect(validateKVIsolation(validEnv)).resolves.not.toThrow();
  });

  it("should throw if a KV matches a different environment", async () => {
    mockKV.get.mockImplementation((key: string) => {
      if (key === "__KV_ENVIRONMENT__") return Promise.resolve("staging");
      return Promise.resolve(null);
    });

    const { validateKVIsolation } =
      await import("../../worker/lib/config-utils");
    await expect(validateKVIsolation(validEnv)).rejects.toThrow(
      'KV Isolation Failure: DEALS_PROD is tagged for "staging" but worker is running in "production"',
    );
  });

  it("should skip validation in development", async () => {
    const devEnv = { ...validEnv, ENVIRONMENT: "development" };

    const { validateKVIsolation } =
      await import("../../worker/lib/config-utils");
    await validateKVIsolation(devEnv);

    expect(mockKV.get).not.toHaveBeenCalled();
  });
});
