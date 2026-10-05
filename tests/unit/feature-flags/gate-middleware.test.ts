/**
 * Feature Gate Middleware Tests (NI-1, ADR-032)
 *
 * requireFeature returns null when the flag resolves enabled (defaults are
 * lazily seeded) and a 503 FEATURE_DISABLED response when disabled.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireFeature } from "../../../worker/middleware/feature-gate";
import { setFeatureFlag } from "../../../worker/lib/feature-flags";
import type { Env } from "../../../worker/types";

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function buildEnv(): { env: Env; store: Map<string, string> } {
  const store = new Map<string, string>();
  const env = {
    DEALS_LOCK: {
      get: vi.fn(async <T>(key: string, type?: string): Promise<T | null> => {
        const value = store.get(key);
        if (value === undefined) return null;
        if (type === "json") return JSON.parse(value) as T;
        return value as unknown as T;
      }),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      list: vi.fn(async () => ({ keys: [], list_complete: true })),
    },
  } as unknown as Env;
  return { env, store };
}

describe("requireFeature (ADR-032)", () => {
  let env: Env;
  const request = new Request("https://example.com/api/bulk/import", {
    method: "POST",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    env = buildEnv().env;
  });

  it("returns null when the flag default is enabled (lazy-seeded)", async () => {
    const res = await requireFeature("bulk_import_export", request, env);
    expect(res).toBeNull();
    // Seeding wrote the default flag row
    const flag = await env.DEALS_LOCK.get("ff:bulk_import_export", "json");
    expect(flag).toMatchObject({ name: "bulk_import_export", enabled: true });
  });

  it("returns 503 FEATURE_DISABLED when the flag is off", async () => {
    await setFeatureFlag({ name: "bulk_import_export", enabled: false }, env);
    const res = await requireFeature("bulk_import_export", request, env);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(503);
    const body = (await res?.json()) as Record<string, unknown>;
    expect(body.code).toBe("FEATURE_DISABLED");
    expect(body.feature).toBe("bulk_import_export");
  });

  it("unknown flag names fail closed", async () => {
    const res = await requireFeature("never_declared_flag", request, env);
    expect(res?.status).toBe(503);
  });
});
