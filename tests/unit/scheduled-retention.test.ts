/**
 * Unit tests for runAiActRetentionCleanup in worker/scheduled.ts
 * (issue #906), which wires EUAIActLogger.cleanupExpiredLogs into the
 * daily cron so retention_until is actually enforced.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../../worker/types";
import { runAiActRetentionCleanup } from "../../worker/scheduled";

vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function envWithDb(prepareImpl: () => unknown): Env {
  const db = {
    prepare: vi.fn(() => prepareImpl()),
  } as unknown as D1Database;
  return { DEALS_DB: db } as unknown as Env;
}

describe("runAiActRetentionCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to 0 when the DEALS_DB binding is absent", async () => {
    const env = {} as unknown as Env;

    await expect(runAiActRetentionCleanup(env)).resolves.toBe(0);
  });

  it("returns the expired-log delete count", async () => {
    const run = vi.fn(async () => ({ meta: { changes: 4 } }));
    const env = envWithDb(() => ({
      bind: vi.fn(() => ({ run })),
      run,
    }));

    await expect(runAiActRetentionCleanup(env)).resolves.toBe(4);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("propagates D1 failures for the caller to treat as non-critical", async () => {
    const env = envWithDb(() => {
      throw new Error("D1 unavailable");
    });

    await expect(runAiActRetentionCleanup(env)).rejects.toThrow(
      "D1 unavailable",
    );
  });
});
