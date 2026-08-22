/**
 * Unit tests for worker/lib/d1/referrals-batch.ts
 *
 * Covers insertReferralsBatch: atomic multi-row upsert, empty-input no-op,
 * MAX_BATCH_SIZE truncation, column defaults (USD / quarantined), and
 * error propagation.
 *
 * Behavioral tests use the shared D1 mock fixture; parameter-binding
 * assertions use a small local recording double because the fixture does
 * not expose bound parameters.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  insertReferralsBatch,
  type ReferralRecord,
} from "../../../worker/lib/d1/referrals-batch";
import { createMockD1, type LockRow } from "../../fixtures/d1-mock";

// ============================================================================
// Recording mock for bind-parameter assertions
// ============================================================================

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/**
 * Minimal D1 test double that records every bound statement.
 * Cast rationale: only implements the D1Database surface exercised by the
 * module under test (prepare/bind/run/batch); the single widening here keeps
 * individual mocks fully typed without per-call casts.
 */
function createRecordingDb() {
  const queries: RecordedQuery[] = [];
  const batch = vi.fn(async (statements: unknown[]) =>
    statements.map(() => ({ results: [], meta: {} })),
  );

  const prepare = vi.fn((sql: string) => ({
    bind: (...params: unknown[]) => {
      queries.push({ sql, params });
      return { run: vi.fn(async () => ({ results: [], meta: {} })) };
    },
  }));

  const db = { prepare, batch } as unknown as D1Database;

  return { db, queries, prepare, batch };
}

function makeReferral(overrides: Partial<ReferralRecord> = {}): ReferralRecord {
  return {
    id: "ref-1",
    code: "SAVE20",
    url: "https://example.com/invite/save20",
    domain: "example.com",
    source: "reddit",
    ...overrides,
  };
}

describe("d1/referrals-batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op for an empty referral list", async () => {
    const db = createMockD1(new Map<string, LockRow>());

    await expect(insertReferralsBatch(db, [])).resolves.toBeUndefined();

    expect(db.prepare).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("upserts every record in one atomic batch call", async () => {
    const db = createMockD1(new Map<string, LockRow>());
    const referrals = [
      makeReferral({ id: "ref-1" }),
      makeReferral({ id: "ref-2", code: "BOGO50" }),
      makeReferral({ id: "ref-3" }),
      makeReferral({ id: "ref-4" }),
    ];

    await insertReferralsBatch(db, referrals);

    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArg = (db.batch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(batchArg).toHaveLength(4);
  });

  it("truncates oversized input to the 100-row D1 limit", async () => {
    const db = createMockD1(new Map<string, LockRow>());
    const referrals = Array.from({ length: 150 }, (_, i) =>
      makeReferral({ id: `ref-${i}` }),
    );

    await insertReferralsBatch(db, referrals);

    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArg = (db.batch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(batchArg).toHaveLength(100);
  });

  it("never binds rows dropped by the truncation window", async () => {
    const rec = createRecordingDb();
    const referrals = Array.from({ length: 120 }, (_, i) =>
      makeReferral({ id: `ref-${i}` }),
    );

    await insertReferralsBatch(rec.db, referrals);

    expect(rec.queries).toHaveLength(100);
    const writtenIds = rec.queries.map((q) => q.params[0]);
    expect(writtenIds).not.toContain("ref-119");
    expect(rec.queries[99]?.params[0]).toBe("ref-99");
  });

  it("uses INSERT ... ON CONFLICT upsert SQL", async () => {
    const rec = createRecordingDb();

    await insertReferralsBatch(rec.db, [makeReferral()]);

    expect(rec.queries[0]?.sql).toContain("INSERT INTO referrals");
    expect(rec.queries[0]?.sql).toContain("ON CONFLICT(id) DO UPDATE");
  });

  it("binds all columns in table order", async () => {
    const rec = createRecordingDb();

    await insertReferralsBatch(rec.db, [
      makeReferral({
        id: "ref-full",
        code: "FULL10",
        url: "https://full.test/r",
        domain: "full.test",
        source: "github",
        title: "Full Record",
        description: "Every optional field set",
        rewardType: "credit",
        rewardValue: "$10",
        currency: "EUR",
        status: "active",
      }),
    ]);

    expect(rec.queries[0]?.params).toEqual([
      "ref-full",
      "FULL10",
      "https://full.test/r",
      "full.test",
      "github",
      "Full Record",
      "Every optional field set",
      "credit",
      "$10",
      "EUR",
      "active",
    ]);
  });

  it("applies the USD currency default when omitted", async () => {
    const rec = createRecordingDb();

    await insertReferralsBatch(rec.db, [makeReferral()]);

    expect(rec.queries[0]?.params[9]).toBe("USD");
  });

  it("applies the quarantined status default when omitted", async () => {
    const rec = createRecordingDb();

    await insertReferralsBatch(rec.db, [makeReferral()]);

    expect(rec.queries[0]?.params[10]).toBe("quarantined");
  });

  it("binds null for omitted optional metadata columns", async () => {
    const rec = createRecordingDb();

    await insertReferralsBatch(rec.db, [makeReferral()]);

    expect(rec.queries[0]?.params.slice(5, 9)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("propagates D1 batch failures", async () => {
    const db = createMockD1(new Map<string, LockRow>());
    (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("constraint failed"),
    );

    await expect(insertReferralsBatch(db, [makeReferral()])).rejects.toThrow(
      "constraint failed",
    );
  });
});
