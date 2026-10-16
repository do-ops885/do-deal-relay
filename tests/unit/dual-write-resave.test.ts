/**
 * Regression test: re-saving an existing referral through the real
 * dual-write path must upsert without a FOREIGN KEY failure.
 *
 * Contract under test: calling `storeReferralDual(env, referral)` twice
 * with the same referral id/code succeeds both times, and
 * `getReferralByCode(env, code)` resolves afterwards.
 *
 * The in-memory D1 double below mimics real SQLite/D1 semantics:
 * - `deals` is keyed by deal_id with an autoincrement integer id. The
 *   `INSERT ... ON CONFLICT(deal_id) DO UPDATE` upsert inserts on the
 *   first call (last_row_id = new id) and UPDATES on the second call,
 *   returning a stale last_row_id of 0 — exactly like SQLite/D1, where
 *   last_row_id is "the last inserted row ID" (see
 *   https://developers.cloudflare.com/d1/worker-api/return-object/).
 * - `referral_codes` enforces a real foreign-key check: the insert is
 *   rejected with `Error("FOREIGN KEY constraint failed")` when deal_id
 *   does not match an existing deals row id.
 *
 * Against the current buggy code the second save reuses the stale upsert
 * rowId (so the referral_codes write is skipped or FK-rejected and the
 * row keeps first-save values); once the fix resolves the deals id via
 * lookup, the second save persists and every assertion below passes.
 */

import { describe, it, expect } from "vitest";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type { Env, ReferralInput } from "../../worker/types";
import {
  storeReferralDual,
  getReferralById,
  getReferralByCode,
} from "../../worker/lib/referral-storage/dual-write";

// ============================================================================
// Map-backed KV namespace mock (get/put/delete/list)
// ============================================================================

interface MockKV {
  kv: KVNamespace;
  store: Map<string, string>;
}

function createMockKV(): MockKV {
  const store = new Map<string, string>();
  const kv = {
    get: async (key: string, type?: string): Promise<unknown> => {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value) as unknown;
      return value;
    },
    put: async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
    list: async (options?: { prefix?: string }): Promise<unknown> => {
      const prefix = options?.prefix ?? "";
      const keys = [...store.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
  return { kv, store };
}

// ============================================================================
// Faithful in-memory D1 mock (SQLite semantics)
// ============================================================================

interface MockDealRow {
  id: number;
  deal_id: string;
  title: string | null;
  description: string | null;
}

interface MockReferralCodeRow {
  id: number;
  code: string;
  deal_id: number;
  status: string;
  expires_at: string | null;
  metadata: string;
}

interface MockD1 {
  db: D1Database;
  fkViolations: string[];
  deals: () => MockDealRow[];
  referralCode: (code: string) => MockReferralCodeRow | undefined;
}

/** SQLite/D1 phrasing for a foreign-key violation. */
const FK_ERROR_MESSAGE = "FOREIGN KEY constraint failed";

function createMockD1(): MockD1 {
  const dealsByDealId = new Map<string, MockDealRow>();
  const dealsById = new Map<number, MockDealRow>();
  const codesByCode = new Map<string, MockReferralCodeRow>();
  const fkViolations: string[] = [];
  let nextDealId = 1;
  let nextCodeId = 1;

  function runDealsUpsert(params: unknown[]): {
    success: boolean;
    meta: Record<string, unknown>;
  } {
    const dealId = params[0];
    if (typeof dealId !== "string") {
      throw new Error("invalid deal_id binding");
    }
    const existing = dealsByDealId.get(dealId);
    if (existing) {
      // ON CONFLICT(deal_id) DO UPDATE: the row is updated, but no new
      // row is inserted, so SQLite reports a stale last_insert_rowid (0).
      const title = params[1];
      const description = params[2];
      if (typeof title === "string") existing.title = title;
      if (typeof description === "string" || description === null) {
        existing.description = description;
      }
      return { success: true, meta: { last_row_id: 0, changes: 1 } };
    }
    const row: MockDealRow = {
      id: nextDealId,
      deal_id: dealId,
      title: typeof params[1] === "string" ? params[1] : null,
      description:
        typeof params[2] === "string" || params[2] === null ? params[2] : null,
    };
    nextDealId += 1;
    dealsByDealId.set(dealId, row);
    dealsById.set(row.id, row);
    return { success: true, meta: { last_row_id: row.id, changes: 1 } };
  }

  function runReferralCodeUpsert(params: unknown[]): {
    success: boolean;
    meta: Record<string, unknown>;
  } {
    const code = params[0];
    const dealId = params[1];
    if (typeof code !== "string" || typeof dealId !== "number") {
      throw new Error("invalid referral_codes binding");
    }
    // Real foreign-key enforcement: referral_codes.deal_id must reference
    // an existing deals row id.
    if (!dealsById.has(dealId)) {
      const detail =
        `referral_codes deal_id ${dealId} has no matching deals row ` +
        `(code ${code})`;
      fkViolations.push(detail);
      throw new Error(FK_ERROR_MESSAGE);
    }
    const status = typeof params[7] === "string" ? params[7] : "active";
    const expiresAt =
      typeof params[9] === "string" || params[9] === null ? params[9] : null;
    const metadata = typeof params[14] === "string" ? params[14] : "{}";
    const existing = codesByCode.get(code);
    if (existing) {
      // ON CONFLICT(code) DO UPDATE mirrors the production upsert clause.
      existing.deal_id = dealId;
      existing.status = status;
      existing.expires_at = expiresAt;
      existing.metadata = metadata;
      return { success: true, meta: { last_row_id: 0, changes: 1 } };
    }
    const row: MockReferralCodeRow = {
      id: nextCodeId,
      code,
      deal_id: dealId,
      status,
      expires_at: expiresAt,
      metadata,
    };
    nextCodeId += 1;
    codesByCode.set(code, row);
    return { success: true, meta: { last_row_id: row.id, changes: 1 } };
  }

  function selectDeals(params: unknown[]): MockDealRow[] {
    if (params.length === 0) return [...dealsByDealId.values()];
    const key = params[0];
    if (typeof key === "string") {
      const row = dealsByDealId.get(key);
      return row ? [row] : [];
    }
    if (typeof key === "number") {
      const row = dealsById.get(key);
      return row ? [row] : [];
    }
    return [];
  }

  function selectReferralCodes(params: unknown[]): MockReferralCodeRow[] {
    if (params.length === 0) return [...codesByCode.values()];
    const key = params[0];
    if (typeof key === "string") {
      const row = codesByCode.get(key);
      return row ? [row] : [];
    }
    return [];
  }

  function selectAll(sql: string, params: unknown[]): unknown[] {
    if (sql.includes("FROM deals")) return selectDeals(params);
    if (sql.includes("FROM referral_codes")) return selectReferralCodes(params);
    return [];
  }

  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: async (): Promise<unknown> => {
          const rows = selectAll(sql, params);
          return rows[0] ?? null;
        },
        all: async (): Promise<unknown> => ({
          results: selectAll(sql, params),
          success: true,
          meta: {},
        }),
        run: async (): Promise<unknown> => {
          if (sql.includes("INSERT INTO deals")) {
            return { ...runDealsUpsert(params), results: [] };
          }
          if (sql.includes("INSERT INTO referral_codes")) {
            return { ...runReferralCodeUpsert(params), results: [] };
          }
          if (sql.includes("SELECT")) {
            return {
              success: true,
              results: selectAll(sql, params),
              meta: {},
            };
          }
          return { success: true, results: [], meta: { changes: 0 } };
        },
      }),
    }),
  } as unknown as D1Database;

  return {
    db,
    fkViolations,
    deals: () => [...dealsByDealId.values()],
    referralCode: (code: string) => codesByCode.get(code),
  };
}

// ============================================================================
// Test environment
// ============================================================================

interface TestEnv {
  env: Env;
  d1: MockD1;
}

function createTestEnv(): TestEnv {
  const sources = createMockKV();
  const log = createMockKV();
  const d1 = createMockD1();
  const env = {
    DEALS_SOURCES: sources.kv,
    DEALS_LOG: log.kv,
    DEALS_DB: d1.db,
    ENVIRONMENT: "test",
    USE_D1_READS: "false",
  } as unknown as Env;
  return { env, d1 };
}

function makeReferral(overrides: Partial<ReferralInput> = {}): ReferralInput {
  return {
    id: "ref-resave-1",
    code: "RESAVE20",
    url: "https://example.com/invite/resave20",
    domain: "example.com",
    description: "Re-save regression referral",
    status: "active",
    submitted_at: new Date().toISOString(),
    submitted_by: "regression-test",
    metadata: {
      title: "Resave",
      category: ["referral"],
      tags: [],
    },
    ...overrides,
  };
}

/** Second save carries observable D1 changes (covered by DO UPDATE). */
function makeResavedReferral(): ReferralInput {
  return makeReferral({
    description: "Re-save regression referral (updated on re-save)",
    expires_at: "2030-01-01T00:00:00.000Z",
    metadata: {
      title: "Resave",
      notes: "second save",
      category: ["referral"],
      tags: [],
    },
  });
}

describe("dual-write re-save", () => {
  it("re-saving the same referral upserts without a foreign-key failure", async () => {
    const { env, d1 } = createTestEnv();
    const first = makeReferral();
    const second = makeResavedReferral();

    await expect(storeReferralDual(env, first)).resolves.toMatchObject({
      id: first.id,
      code: first.code,
    });
    await expect(storeReferralDual(env, second)).resolves.toMatchObject({
      id: second.id,
      code: second.code,
    });

    // The re-save must never hit the referral_codes FK guard.
    expect(d1.fkViolations).toEqual([]);

    // The deal is upserted, not duplicated.
    const dealRows = d1.deals();
    expect(dealRows).toHaveLength(1);
    const dealRow = dealRows.at(0);
    expect(dealRow?.deal_id).toBe(first.id);
    expect(dealRow?.description).toContain("updated on re-save");

    // The referral_codes row reflects the LATEST save and links to the
    // deals row. Pre-fix this still holds first-save values (write
    // skipped) or is missing, so these assertions reproduce the bug.
    const codeRow = d1.referralCode(second.code);
    expect(codeRow?.code).toBe(second.code);
    expect(codeRow?.deal_id).toBe(dealRow?.id);
    expect(codeRow?.expires_at).toBe(second.expires_at);
    expect(codeRow?.metadata).toContain("second save");
  });

  it("KV reads still resolve after re-save", async () => {
    const { env } = createTestEnv();

    await storeReferralDual(env, makeReferral());
    await storeReferralDual(env, makeResavedReferral());

    await expect(getReferralById(env, "ref-resave-1")).resolves.toMatchObject({
      id: "ref-resave-1",
      code: "RESAVE20",
    });
    await expect(getReferralByCode(env, "RESAVE20")).resolves.toMatchObject({
      id: "ref-resave-1",
      code: "RESAVE20",
    });
  });
});
