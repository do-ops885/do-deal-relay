/**
 * Unit tests for the referral history-entry TTL in
 * worker/lib/referral-storage/types.ts (issue #904).
 *
 * History keys are append-only; without an expirationTtl every status
 * change leaves a permanent key, so logReferralChange must expire them.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Env } from "../../../worker/types";
import {
  REFERRAL_KEYS,
  logReferralChange,
} from "../../../worker/lib/referral-storage/types";

interface PutCall {
  key: string;
  value: string;
  options?: unknown;
}

function createMockEnv() {
  const puts: PutCall[] = [];

  const kv = {
    get: vi.fn(async () => null),
    put: vi.fn(async (key: string, value: string, options?: unknown) => {
      puts.push({ key, value, options });
    }),
    delete: vi.fn(async () => {}),
  } as unknown as KVNamespace;

  const env = { DEALS_SOURCES: kv } as unknown as Env;
  return { env, puts };
}

describe("referral history retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes history entries with an expiration TTL", async () => {
    const { env, puts } = createMockEnv();

    await logReferralChange(env, {
      referral_id: "referral-ttl",
      code: "TESTCODE",
      change_type: "status_update",
      old_value: "quarantined",
      new_value: "active",
      timestamp: new Date().toISOString(),
    });

    const historyPuts = puts.filter((put) =>
      put.key.startsWith(REFERRAL_KEYS.HISTORY_PREFIX),
    );
    expect(historyPuts).toHaveLength(1);
    for (const put of historyPuts) {
      expect(put.options).toMatchObject({ expirationTtl: expect.any(Number) });
      const ttl = (put.options as { expirationTtl: number }).expirationTtl;
      expect(ttl).toBeGreaterThan(0);
    }
  });
});
