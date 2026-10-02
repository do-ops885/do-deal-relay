import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  recordDealFeedback,
  getDealFeedbackStats,
} from "../../../worker/lib/d1/deal-feedback";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

function createScriptedDb(
  options: {
    runChanges?: number[];
    firstRows?: unknown[];
    runError?: boolean;
  } = {},
) {
  const queries: RecordedQuery[] = [];
  const runQueue = [...(options.runChanges ?? [])];
  const firstQueue = [...(options.firstRows ?? [])];

  const prepare = vi.fn((sql: string) => {
    const run = vi.fn(async () => {
      if (options.runError) throw new Error("D1 write failed");
      const changes = runQueue.shift() ?? 0;
      return { success: true, meta: { changes } };
    });
    const first = vi.fn(async () => {
      const next = firstQueue.shift();
      return next ?? null;
    });
    const all = vi.fn(async () => ({ results: [], meta: {} }));
    return {
      bind: (...params: unknown[]) => {
        queries.push({ sql, params });
        return { run, first, all };
      },
      run,
      first,
      all,
    };
  });

  const db = { prepare } as unknown as D1Database;
  return { db, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("d1/deal-feedback recordDealFeedback", () => {
  it("reports an insert when meta.changes is 1", async () => {
    const { db, queries } = createScriptedDb({ runChanges: [1] });
    const inserted = await recordDealFeedback(db, {
      userId: "user-1",
      referralCode: "AWS500",
      outcome: "success",
    });
    expect(inserted).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain("INSERT INTO deal_feedback");
    expect(queries[0]?.sql).toContain("ON CONFLICT(user_id, referral_code)");
    expect(queries[0]?.sql).toContain("DO UPDATE SET");
  });

  it("reports an update when meta.changes is 2 (upsert revision)", async () => {
    const { db } = createScriptedDb({ runChanges: [2] });
    const inserted = await recordDealFeedback(db, {
      userId: "user-1",
      referralCode: "AWS500",
      outcome: "expired",
      sourceChannel: "bot",
      comment: "code no longer listed",
    });
    expect(inserted).toBe(false);
  });

  it("binds the default source channel when none is provided", async () => {
    const { db, queries } = createScriptedDb({ runChanges: [1] });
    await recordDealFeedback(db, {
      userId: "user-1",
      referralCode: "AWS500",
      outcome: "invalid",
    });
    const params = queries[0]?.params ?? [];
    expect(params).toContain("api");
  });

  it("propagates D1 write failures", async () => {
    const { db } = createScriptedDb({ runError: true });
    await expect(
      recordDealFeedback(db, {
        userId: "user-1",
        referralCode: "AWS500",
        outcome: "success",
      }),
    ).rejects.toThrow("D1 write failed");
  });
});

describe("d1/deal-feedback getDealFeedbackStats", () => {
  it("aggregates outcomes and derives the success ratio", async () => {
    const { db, queries } = createScriptedDb({
      firstRows: [{ total: 4, success: 3, expired: 1, invalid: 0 }],
    });
    const stats = await getDealFeedbackStats(db, "AWS500");
    expect(stats).toEqual({
      total: 4,
      success: 3,
      expired: 1,
      invalid: 0,
      successRatio: 0.75,
    });
    expect(queries[0]?.sql).toContain("FROM deal_feedback");
    expect(queries[0]?.sql).toContain("referral_code = ?1");
  });

  it("treats null sums as zero and returns ratio 0 for no data", async () => {
    const { db } = createScriptedDb({
      firstRows: [{ total: 0, success: null, expired: null, invalid: null }],
    });
    const stats = await getDealFeedbackStats(db, "UNKNOWN");
    expect(stats.total).toBe(0);
    expect(stats.success).toBe(0);
    expect(stats.successRatio).toBe(0);
  });

  it("returns zeroed stats when the row is missing entirely", async () => {
    const { db } = createScriptedDb({ firstRows: [null] });
    const stats = await getDealFeedbackStats(db, "AWS500");
    expect(stats.total).toBe(0);
    expect(stats.successRatio).toBe(0);
  });
});
