/**
 * Unit tests for the referral id fallback in
 * worker/lib/referral-storage/crud.ts (issue #905).
 *
 * Submissions without an id must receive unique generated ids instead of
 * colliding on a shared "unknown" key.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Env, ReferralInput } from "../../../worker/types";
import { REFERRAL_KEYS } from "../../../worker/lib/referral-storage/types";
import { storeReferralInput } from "../../../worker/lib/referral-storage/crud";

interface PutCall {
  key: string;
  value: string;
  options?: unknown;
}

function createMockEnv() {
  const storage = new Map<string, string>();
  const puts: PutCall[] = [];

  const kv = {
    get: vi.fn(async (key: string, type?: string) => {
      const value = storage.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      return value;
    }),
    put: vi.fn(async (key: string, value: string, options?: unknown) => {
      storage.set(key, value);
      puts.push({ key, value, options });
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  } as unknown as KVNamespace;

  const env = { DEALS_SOURCES: kv } as unknown as Env;
  return { env, storage, puts, kv };
}

function makeReferral(overrides: Partial<ReferralInput> = {}): ReferralInput {
  return {
    url: "https://example.com/invite",
    code: "TESTCODE",
    domain: "example.com",
    status: "active",
    submitted_at: new Date().toISOString(),
    submitted_by: "test",
    ...overrides,
  };
}

describe("storeReferralInput id handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a unique id when the referral has none", async () => {
    const { env, storage } = createMockEnv();

    const stored = await storeReferralInput(env, makeReferral());

    expect(stored.id).toBeDefined();
    expect(typeof stored.id).toBe("string");
    expect(stored.id?.length).toBeGreaterThan(0);
    expect(storage.has(`${REFERRAL_KEYS.INPUT_PREFIX}${stored.id}`)).toBe(true);
    expect(storage.has(`${REFERRAL_KEYS.INPUT_PREFIX}unknown`)).toBe(false);
  });

  it("assigns distinct keys to concurrent id-less submissions", async () => {
    const { env, storage } = createMockEnv();

    const first = await storeReferralInput(
      env,
      makeReferral({ code: "CODE-A" }),
    );
    const second = await storeReferralInput(
      env,
      makeReferral({ code: "CODE-B" }),
    );

    expect(first.id).not.toBe(second.id);
    const inputKeys = [...storage.keys()].filter((key) =>
      key.startsWith(REFERRAL_KEYS.INPUT_PREFIX),
    );
    expect(inputKeys).toHaveLength(2);
  });

  it("preserves a caller-supplied id", async () => {
    const { env, storage } = createMockEnv();

    const stored = await storeReferralInput(
      env,
      makeReferral({ id: "referral-123" }),
    );

    expect(stored.id).toBe("referral-123");
    expect(storage.has(`${REFERRAL_KEYS.INPUT_PREFIX}referral-123`)).toBe(true);
  });

  it("treats an empty-string id as missing", async () => {
    const { env, storage } = createMockEnv();

    const stored = await storeReferralInput(env, makeReferral({ id: "" }));

    expect(stored.id).toBeDefined();
    expect(stored.id?.length).toBeGreaterThan(0);
    expect(storage.has(`${REFERRAL_KEYS.INPUT_PREFIX}unknown`)).toBe(false);
  });
});
