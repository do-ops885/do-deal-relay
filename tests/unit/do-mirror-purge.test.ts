/**
 * Unit tests for purgeOldDeals in worker/lib/do-mirror.ts (issue #897).
 *
 * purgeOldDeals wires DealRegistry.purgeOld into the weekly cron as a
 * best-effort sweep so the DO deals table cannot grow without bound.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import type { Env } from "../../worker/types";
import { purgeOldDeals } from "../../worker/lib/do-mirror";

vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function envWithRegistry(stub: unknown): Env {
  const namespace = {
    idFromName: vi.fn((name: string) => ({ name })),
    get: vi.fn((_id: unknown) => stub),
  } as unknown as DurableObjectNamespace;
  return { DEAL_REGISTRY: namespace } as unknown as Env;
}

describe("purgeOldDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to 0 when the DEAL_REGISTRY binding is absent", async () => {
    const env = {} as unknown as Env;

    await expect(purgeOldDeals(env)).resolves.toBe(0);
  });

  it("resolves to 0 when the stub has no purgeOld RPC", async () => {
    const env = envWithRegistry({ stageDeals: vi.fn() });

    await expect(purgeOldDeals(env)).resolves.toBe(0);
  });

  it("delegates to purgeOld with the 90-day default window", async () => {
    const purgeOld = vi.fn(async (_maxAgeMs: number) => 7);
    const env = envWithRegistry({ purgeOld });

    await expect(purgeOldDeals(env)).resolves.toBe(7);
    expect(purgeOld).toHaveBeenCalledTimes(1);
    expect(purgeOld).toHaveBeenCalledWith(NINETY_DAYS_MS);
  });

  it("forwards an explicit maxAgeMs", async () => {
    const purgeOld = vi.fn(async (_maxAgeMs: number) => 2);
    const env = envWithRegistry({ purgeOld });

    await expect(purgeOldDeals(env, 1000)).resolves.toBe(2);
    expect(purgeOld).toHaveBeenCalledWith(1000);
  });

  it("resolves to 0 when the RPC rejects", async () => {
    const purgeOld = vi.fn(async (_maxAgeMs: number) => {
      throw new Error("DO unavailable");
    });
    const env = envWithRegistry({ purgeOld });

    await expect(purgeOldDeals(env)).resolves.toBe(0);
  });
});
