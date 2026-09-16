import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  planPublishReadonly,
  publishStepName,
} from "../../../worker/workflows/publish-shadow";
import type { Env } from "../../../worker/types";
import type { Snapshot } from "../../../worker/types";

const RUN_ID = "wave3-run";
const STAGING_HASH = "staging-hash-1";
const PROD_HASH = "prod-hash-9";

function createSnapshot(hash: string): Snapshot {
  return { snapshot_hash: hash } as unknown as Snapshot;
}

function createPublishEnv(options?: {
  staging?: Snapshot | null;
  production?: Snapshot | null;
}): { env: Env; kvPut: ReturnType<typeof vi.fn> } {
  const kvPut = vi.fn(
    async (_key: string, _value: string): Promise<void> => {},
  );
  const stagingGet = vi.fn(async (): Promise<unknown> => {
    if (options?.staging !== undefined) {
      return options.staging;
    }
    return null;
  });
  const prodGet = vi.fn(async (): Promise<unknown> => {
    if (options?.production !== undefined) {
      return options.production;
    }
    return null;
  });
  const dbRun = vi.fn(async (): Promise<unknown> => ({}));
  const env = {
    DEALS_STAGING: { get: stagingGet, put: kvPut } as unknown as KVNamespace,
    DEALS_PROD: {
      get: prodGet,
      put: kvPut,
    } as unknown as KVNamespace,
    DEALS_DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async (): Promise<null> => null),
          run: dbRun,
        })),
      })),
    } as unknown as D1Database,
  } as unknown as Env;
  return { env, kvPut };
}

describe("publishStepName", () => {
  it("should build deterministic names without timestamps or randomness", (): void => {
    expect(publishStepName(RUN_ID)).toBe("publish-dry-run-wave3-run");
    expect(publishStepName(RUN_ID)).toBe(publishStepName(RUN_ID));
  });

  it("should sanitize unsafe run id characters in step names", (): void => {
    expect(publishStepName("run/1:2")).toBe("publish-dry-run-run-1-2");
  });
});

describe("planPublishReadonly", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it("should report nothing to publish without any writes when staging is absent", async (): Promise<void> => {
    const { env, kvPut } = createPublishEnv({
      staging: null,
      production: createSnapshot(PROD_HASH),
    });

    const summary = await planPublishReadonly(env, 0);

    expect(summary.staging_present).toBe(false);
    expect(summary.production_present).toBe(true);
    expect(summary.hashes_match).toBe(false);
    expect(summary.would_publish).toBe(false);
    expect(summary.sampled_deals).toBe(0);
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("should report publish when staging differs from production", async (): Promise<void> => {
    const { env, kvPut } = createPublishEnv({
      staging: createSnapshot(STAGING_HASH),
      production: createSnapshot(PROD_HASH),
    });

    const summary = await planPublishReadonly(env, 4);

    expect(summary.staging_present).toBe(true);
    expect(summary.production_present).toBe(true);
    expect(summary.hashes_match).toBe(false);
    expect(summary.would_publish).toBe(true);
    expect(summary.sampled_deals).toBe(4);
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("should report no publish when hashes already match", async (): Promise<void> => {
    const { env, kvPut } = createPublishEnv({
      staging: createSnapshot(STAGING_HASH),
      production: createSnapshot(STAGING_HASH),
    });

    const summary = await planPublishReadonly(env, 2);

    expect(summary.hashes_match).toBe(true);
    expect(summary.would_publish).toBe(false);
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("should report publish when production is absent without writing", async (): Promise<void> => {
    const { env, kvPut } = createPublishEnv({
      staging: createSnapshot(STAGING_HASH),
      production: null,
    });

    const summary = await planPublishReadonly(env, 1);

    expect(summary.staging_present).toBe(true);
    expect(summary.production_present).toBe(false);
    expect(summary.would_publish).toBe(true);
    expect(kvPut).not.toHaveBeenCalled();
  });
});
