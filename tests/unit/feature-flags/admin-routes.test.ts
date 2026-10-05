/**
 * Admin Feature Flag Route Tests (NI-1, ADR-032)
 *
 * GET /api/admin/flags lists lazily-seeded flags; PUT /api/admin/flags/:name
 * updates an existing flag (404 for unknown names, 400 for bad input).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleListFlags,
  handleUpdateFlag,
} from "../../../worker/routes/admin/flags";
import { getFeatureFlag } from "../../../worker/lib/feature-flags";
import type { Env } from "../../../worker/types";

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function buildEnv(): Env {
  const store = new Map<string, string>();
  return {
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
      list: vi.fn(async (options?: { prefix?: string }) => {
        const keys = [...store.keys()]
          .filter((k) => !options?.prefix || k.startsWith(options.prefix))
          .map((name) => ({ name }));
        return { keys, list_complete: true };
      }),
    },
  } as unknown as Env;
}

function putRequest(name: string, body: unknown): Request {
  return new Request(`https://example.com/api/admin/flags/${name}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("admin flag routes (ADR-032)", () => {
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    env = buildEnv();
  });

  it("GET lists all seeded default flags sorted by name", async () => {
    const res = await handleListFlags(
      env,
      new Request("https://example.com/api/admin/flags"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      flags: Array<{ name: string }>;
      count: number;
    };
    expect(body.count).toBe(9);
    const names = body.flags.map((f) => f.name);
    expect(names).toContain("bulk_import_export");
    expect(names).toContain("ai_extractor_scraper");
    expect([...names].sort()).toEqual(names);
  });

  it("PUT flips enabled and persists", async () => {
    const res = await handleUpdateFlag(
      putRequest("email_processing", { enabled: false }),
      env,
      "email_processing",
    );
    expect(res.status).toBe(200);
    const flag = await getFeatureFlag("email_processing", env);
    expect(flag?.enabled).toBe(false);
  });

  it("PUT returns 404 for unknown flag names", async () => {
    const res = await handleUpdateFlag(
      putRequest("not_a_real_flag", { enabled: true }),
      env,
      "not_a_real_flag",
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("FLAG_NOT_FOUND");
  });

  it("PUT returns 400 for invalid flag name characters", async () => {
    const res = await handleUpdateFlag(
      putRequest("Bad-Name!", { enabled: true }),
      env,
      "Bad-Name!",
    );
    expect(res.status).toBe(400);
  });

  it("PUT returns 400 for an empty update body", async () => {
    const res = await handleUpdateFlag(
      putRequest("email_processing", {}),
      env,
      "email_processing",
    );
    expect(res.status).toBe(400);
  });

  it("PUT returns 400 for out-of-range rolloutPercentage", async () => {
    const res = await handleUpdateFlag(
      putRequest("email_processing", { rolloutPercentage: 101 }),
      env,
      "email_processing",
    );
    expect(res.status).toBe(400);
  });

  it("PUT returns 400 for non-JSON body", async () => {
    const res = await handleUpdateFlag(
      putRequest("email_processing", "not-json{"),
      env,
      "email_processing",
    );
    expect(res.status).toBe(400);
  });

  it("PUT preserves fields not included in the update", async () => {
    await handleUpdateFlag(
      putRequest("email_processing", { rolloutPercentage: 42 }),
      env,
      "email_processing",
    );
    const res = await handleUpdateFlag(
      putRequest("email_processing", { enabled: false }),
      env,
      "email_processing",
    );
    expect(res.status).toBe(200);
    const flag = await getFeatureFlag("email_processing", env);
    expect(flag?.enabled).toBe(false);
    expect(flag?.rolloutPercentage).toBe(42);
  });
});
