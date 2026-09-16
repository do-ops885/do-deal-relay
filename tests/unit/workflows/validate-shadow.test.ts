import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chunkShadowKeys,
  validateBatchReadonly,
  validateBatchStepName,
  SHADOW_VALIDATE_BATCH_SIZE,
} from "../../../worker/workflows/validate-shadow";
import type {
  ShadowSampleKey,
  ShadowSourceSummary,
} from "../../../worker/pipeline/discover";
import type { Env } from "../../../worker/types";
import type { ValidationCacheEntry } from "../../../worker/types/validation-cache";

const RUN_ID = "wave2-run";
const BATCH_INDEX = 3;
const BATCH_SIZE_TWO = 2;
const EXPECTED_BATCH_COUNT = 2;
const EXPECTED_CHECKED = 3;
const EXPECTED_HITS = 1;

const ACCEPTED_ENTRY: ValidationCacheEntry = {
  status: "accepted",
  fingerprint: "fp-hit",
  normalizedUrl: "https://hit.com/deal",
  createdAt: new Date().toISOString(),
};

function createSummary(
  domain: string,
  keys: ShadowSampleKey[],
): ShadowSourceSummary {
  return {
    domain,
    deal_count: keys.length,
    error_count: 0,
    sample_codes: keys.map((key) => key.fingerprint),
    sample_errors: [],
    sample_keys: keys,
  };
}

function createKey(
  domain: string,
  name: string,
  reward_value: number | null = null,
): ShadowSampleKey {
  return {
    url: `https://${domain}/deal/${name}`,
    fingerprint: `fp-${name}`,
    reward_value,
  };
}

function createValidateEnv(options?: {
  cached?: ValidationCacheEntry | null;
}): { env: Env; kvPut: ReturnType<typeof vi.fn> } {
  const kvPut = vi.fn(
    async (_key: string, _value: string): Promise<void> => {},
  );
  const kvGet = vi.fn(async (_key: string): Promise<unknown> => {
    if (options?.cached !== undefined) {
      return options.cached;
    }
    return null;
  });
  const dbFirst = vi.fn(async (): Promise<null> => null);
  const dbRun = vi.fn(async (): Promise<unknown> => ({}));
  const env = {
    DEALS_STAGING: { get: kvGet, put: kvPut } as unknown as KVNamespace,
    DEALS_DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first: dbFirst, run: dbRun })),
      })),
    } as unknown as D1Database,
  } as unknown as Env;
  return { env, kvPut };
}

describe("validateBatchStepName", () => {
  it("should build deterministic names without timestamps or randomness", (): void => {
    expect(validateBatchStepName(BATCH_INDEX, RUN_ID)).toBe(
      "validate-batch-3-wave2-run",
    );
    expect(validateBatchStepName(BATCH_INDEX, RUN_ID)).toBe(
      validateBatchStepName(BATCH_INDEX, RUN_ID),
    );
  });

  it("should sanitize unsafe run id characters in step names", (): void => {
    expect(validateBatchStepName(0, "run/1:2")).toBe(
      "validate-batch-0-run-1-2",
    );
  });
});

describe("chunkShadowKeys", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it("should return no batches for empty summaries", (): void => {
    expect(chunkShadowKeys([])).toEqual([]);
  });

  it("should preserve source order across batches", (): void => {
    const summaries = [
      createSummary("a.com", [
        createKey("a.com", "1"),
        createKey("a.com", "2"),
      ]),
      createSummary("b.com", [createKey("b.com", "3")]),
    ];

    const batches = chunkShadowKeys(summaries, BATCH_SIZE_TWO);

    expect(batches).toHaveLength(EXPECTED_BATCH_COUNT);
    expect(batches[0]).toHaveLength(BATCH_SIZE_TWO);
    expect(batches[1]).toHaveLength(1);
    expect(batches[0]?.[0]?.fingerprint).toBe("fp-1");
    expect(batches[1]?.[0]?.fingerprint).toBe("fp-3");
  });

  it("should default to the configured batch size", (): void => {
    expect(SHADOW_VALIDATE_BATCH_SIZE).toBe(50);
    const summaries = [createSummary("a.com", [createKey("a.com", "1")])];

    expect(chunkShadowKeys(summaries)).toHaveLength(1);
  });

  it("should return no batches for non-positive batch sizes", (): void => {
    const summaries = [createSummary("a.com", [createKey("a.com", "1")])];

    expect(chunkShadowKeys(summaries, 0)).toEqual([]);
    expect(chunkShadowKeys(summaries, -1)).toEqual([]);
  });
});

describe("validateBatchReadonly", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it("should report all misses on an empty cache without any writes", async (): Promise<void> => {
    const { env, kvPut } = createValidateEnv();
    const keys = [createKey("a.com", "1"), createKey("a.com", "2")];

    const summary = await validateBatchReadonly(env, 0, keys);

    expect(summary.batch_index).toBe(0);
    expect(summary.checked).toBe(BATCH_SIZE_TWO);
    expect(summary.hits).toBe(0);
    expect(summary.misses).toBe(BATCH_SIZE_TWO);
    expect(summary.by_source).toEqual({ "a.com": BATCH_SIZE_TWO });
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("should count cache hits without persisting decisions", async (): Promise<void> => {
    const { env, kvPut } = createValidateEnv({ cached: ACCEPTED_ENTRY });
    const keys = [
      createKey("hit.com", "x"),
      createKey("hit.com", "y"),
      createKey("hit.com", "z"),
    ];

    const summary = await validateBatchReadonly(env, 1, keys);

    expect(summary.checked).toBe(EXPECTED_CHECKED);
    expect(summary.hits).toBe(EXPECTED_CHECKED);
    expect(summary.misses).toBe(0);
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("should mix hits and misses and group counts by host", async (): Promise<void> => {
    const kvGet = vi
      .fn(async (_key: string): Promise<unknown> => null)
      .mockResolvedValueOnce(ACCEPTED_ENTRY);
    const kvPut = vi.fn(
      async (_key: string, _value: string): Promise<void> => {},
    );
    const env = {
      DEALS_STAGING: { get: kvGet, put: kvPut } as unknown as KVNamespace,
      DEALS_DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async (): Promise<null> => null),
            run: vi.fn(async (): Promise<unknown> => ({})),
          })),
        })),
      } as unknown as D1Database,
    } as unknown as Env;
    const keys = [createKey("hit.com", "x"), createKey("miss.com", "y")];

    const summary = await validateBatchReadonly(env, 0, keys);

    expect(summary.checked).toBe(BATCH_SIZE_TWO);
    expect(summary.hits).toBe(EXPECTED_HITS);
    expect(summary.misses).toBe(1);
    expect(summary.by_source).toEqual({ "hit.com": 1, "miss.com": 1 });
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("should bucket invalid urls under unknown without throwing", async (): Promise<void> => {
    const { env } = createValidateEnv();
    const keys: ShadowSampleKey[] = [
      { url: "not-a-url", fingerprint: "fp-bad", reward_value: null },
    ];

    const summary = await validateBatchReadonly(env, 0, keys);

    expect(summary.checked).toBe(1);
    expect(summary.by_source).toEqual({ unknown: 1 });
  });

  it("should count d1 index rows as hits without repopulating kv", async (): Promise<void> => {
    const kvGet = vi.fn(async (_key: string): Promise<unknown> => null);
    const kvPut = vi.fn(
      async (_key: string, _value: string): Promise<void> => {},
    );
    const dbRun = vi.fn(async (): Promise<unknown> => ({}));
    const dbFirst = vi.fn(async (): Promise<unknown> => ({
      fingerprint: "fp-d1",
      normalized_url: "https://d1.com/deal/x",
      status: "accepted",
    }));
    const env = {
      DEALS_STAGING: { get: kvGet, put: kvPut } as unknown as KVNamespace,
      DEALS_DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: dbFirst, run: dbRun })),
        })),
      } as unknown as D1Database,
    } as unknown as Env;

    const summary = await validateBatchReadonly(env, 0, [
      createKey("d1.com", "x"),
    ]);

    expect(summary.checked).toBe(1);
    expect(summary.hits).toBe(1);
    expect(summary.misses).toBe(0);
    expect(kvPut).not.toHaveBeenCalled();
    expect(dbRun).not.toHaveBeenCalled();
  });
});
