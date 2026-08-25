/**
 * Unit tests for worker/lib/d1/trust.ts
 *
 * Covers evolveTrust, evolveTrustBatch, getTrustScore, getTrustScores,
 * getTopTrustedDomains, and getDomainsNeedingReview: base-score defaults,
 * min/max clamping, classification boundaries, batch statement construction,
 * empty-input no-ops, and graceful degradation on failed queries.
 *
 * A stateful in-memory D1 double is used so repeated evolutions accumulate
 * against real stored rows instead of canned responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  evolveTrust,
  evolveTrustBatch,
  getTrustScore,
  getTrustScores,
  getTopTrustedDomains,
  getDomainsNeedingReview,
} from "../../worker/lib/d1/trust";

// ============================================================================
// Stateful recording mock
// ============================================================================

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

interface StoredTrustRow {
  domain: string;
  trust_score: number;
  total_deals: number;
  successful_deals: number;
}

const TRUST_MIN = 0;
const TRUST_MAX = 1;

function createTrustDb(
  rows: StoredTrustRow[] = [],
  options: { readbackMisses?: string[] } = {},
) {
  const queries: RecordedQuery[] = [];
  const readbackMisses = options.readbackMisses ?? [];

  function selectRows(sql: string, params: unknown[]): StoredTrustRow[] {
    if (sql.includes("WHERE domain IN (")) {
      const wanted = params.map(String);
      return rows.filter((r) => wanted.includes(r.domain));
    }
    if (sql.includes("WHERE domain = ?")) {
      const matched = rows.filter((r) => r.domain === params[0]);
      // Simulate a replica lag where freshly written rows are invisible.
      if (sql.includes("SELECT trust_score")) {
        return matched.filter((r) => !readbackMisses.includes(r.domain));
      }
      return matched;
    }
    return [...rows];
  }

  function applyUpsert(sql: string, params: unknown[]) {
    // Single-statement upsert (evolveTrust): explicit score is bound.
    // [domain, newScore, successInc, classification, now, ...]
    if (sql.includes("VALUES (?, ?")) {
      const [domain, newScore, successInc] = params;
      const existing = rows.find((r) => r.domain === domain);
      if (existing) {
        existing.trust_score = Number(newScore);
        existing.total_deals += 1;
        existing.successful_deals += Number(successInc);
      } else {
        rows.push({
          domain: String(domain),
          trust_score: Number(newScore),
          total_deals: 1,
          successful_deals: Number(successInc),
        });
      }
      return;
    }

    // Batch upsert (evolveTrustBatch): score evolves from the stored value.
    // [domain, successInc, now, adjustment, successInc, adjustment, adjustment, now]
    const [domain, successInc, , adjustment] = params;
    const existing = rows.find((r) => r.domain === domain);
    if (existing) {
      existing.trust_score = Math.max(
        TRUST_MIN,
        Math.min(TRUST_MAX, existing.trust_score + Number(adjustment)),
      );
      existing.total_deals += 1;
      existing.successful_deals += Number(successInc);
    } else {
      rows.push({
        domain: String(domain),
        trust_score: 0.5,
        total_deals: 1,
        successful_deals: Number(successInc),
      });
    }
  }

  const makeBound = (sql: string, params: unknown[]) => ({
    run: vi.fn(async () => {
      if (sql.includes("INSERT INTO trust_scores")) {
        applyUpsert(sql, params);
        return { results: [], meta: { changes: 1 } };
      }
      return { results: selectRows(sql, params), meta: {} };
    }),
    first: vi.fn(async <T>() => {
      const found = selectRows(sql, params)[0];
      return (found as T | undefined) ?? null;
    }),
  });

  const prepare = vi.fn((sql: string) => {
    const root = makeBound(sql, []);
    return {
      bind: (...params: unknown[]) => {
        queries.push({ sql, params });
        return makeBound(sql, params);
      },
      run: root.run,
      first: root.first,
    };
  });

  const batch = vi.fn(
    async (statements: Array<{ run: () => Promise<unknown> }>) => {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
  );

  const db = { prepare, batch } as unknown as D1Database;

  return { db, rows, queries, prepare, batch };
}

function seedRow(overrides: Partial<StoredTrustRow> = {}): StoredTrustRow {
  return {
    domain: "seeded.example.com",
    trust_score: 0.5,
    total_deals: 0,
    successful_deals: 0,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("d1/trust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // evolveTrust
  // ==========================================================================

  describe("evolveTrust", () => {
    it("defaults a new domain to the 0.5 base and applies +0.05 on success", async () => {
      const rec = createTrustDb();

      const result = await evolveTrust(rec.db, "new.example.com", true);

      expect(result).toEqual({
        domain: "new.example.com",
        previous_score: 0.5,
        new_score: 0.55,
        adjustment: 0.05,
        total_deals: 1,
        successful_deals: 1,
      });
    });

    it("applies -0.02 to a new domain on failure", async () => {
      const rec = createTrustDb();

      const result = await evolveTrust(rec.db, "new.example.com", false);

      expect(result.previous_score).toBe(0.5);
      expect(result.new_score).toBeCloseTo(0.48, 10);
      expect(result.adjustment).toBe(-0.02);
      expect(result.successful_deals).toBe(0);
    });

    it("reads the previous score from storage for an existing domain", async () => {
      const rec = createTrustDb([
        seedRow({ domain: "known.example.com", trust_score: 0.6 }),
      ]);

      const result = await evolveTrust(rec.db, "known.example.com", true);

      expect(result.previous_score).toBe(0.6);
      expect(result.new_score).toBeCloseTo(0.65, 10);
    });

    it("clamps at the maximum score of 1.0", async () => {
      const rec = createTrustDb([seedRow({ trust_score: 0.99 })]);

      const result = await evolveTrust(rec.db, "seeded.example.com", true);

      expect(result.new_score).toBe(1);
    });

    it("clamps at the minimum score of 0.0", async () => {
      const rec = createTrustDb([seedRow({ trust_score: 0.01 })]);

      const result = await evolveTrust(rec.db, "seeded.example.com", false);

      expect(result.new_score).toBe(0);
    });

    it("accumulates deterministically across repeated calls", async () => {
      const rec = createTrustDb();
      await evolveTrust(rec.db, "acc.example.com", true);
      await evolveTrust(rec.db, "acc.example.com", false);

      const third = await evolveTrust(rec.db, "acc.example.com", true);

      expect(third.total_deals).toBe(3);
      expect(third.successful_deals).toBe(2);
      expect(third.previous_score).toBeCloseTo(0.53, 10);
      expect(third.new_score).toBeCloseTo(0.58, 10);
    });

    it("classifies trusted at exactly 0.7 in the written statement", async () => {
      const rec = createTrustDb([seedRow({ trust_score: 0.68 })]);

      await evolveTrust(rec.db, "seeded.example.com", true);

      const write = rec.queries.find((q) =>
        q.sql.includes("INSERT INTO trust_scores"),
      );
      expect(write?.params[3]).toBe("trusted");
    });

    it("classifies probationary between 0.4 and 0.7 in the written statement", async () => {
      const rec = createTrustDb([seedRow({ trust_score: 0.44 })]);

      await evolveTrust(rec.db, "seeded.example.com", true);

      const write = rec.queries.find((q) =>
        q.sql.includes("INSERT INTO trust_scores"),
      );
      expect(write?.params[3]).toBe("probationary");
    });

    it("writes an upsert with ON CONFLICT(domain)", async () => {
      const rec = createTrustDb();

      await evolveTrust(rec.db, "upsert.example.com", true);

      const write = rec.queries.find((q) =>
        q.sql.includes("INSERT INTO trust_scores"),
      );
      expect(write?.sql).toContain("ON CONFLICT(domain) DO UPDATE");
    });

    it("passes an empty domain through without validation", async () => {
      const rec = createTrustDb();

      const result = await evolveTrust(rec.db, "", true);

      expect(result.domain).toBe("");
      expect(result.new_score).toBeCloseTo(0.55, 10);
    });
  });

  // ==========================================================================
  // evolveTrustBatch
  // ==========================================================================

  describe("evolveTrustBatch", () => {
    it("executes one bound statement per domain in a single batch", async () => {
      const rec = createTrustDb();

      await evolveTrustBatch(rec.db, [
        { domain: "a.example.com", success: true },
        { domain: "b.example.com", success: false },
      ]);

      expect(rec.batch).toHaveBeenCalledTimes(1);
      const inserts = rec.queries.filter((q) =>
        q.sql.includes("INSERT INTO trust_scores"),
      );
      expect(inserts).toHaveLength(2);
      expect(inserts.map((q) => q.params[0])).toEqual([
        "a.example.com",
        "b.example.com",
      ]);
    });

    it("issues no statements and returns no results for empty input", async () => {
      const rec = createTrustDb();

      const results = await evolveTrustBatch(rec.db, []);

      expect(results).toEqual([]);
      expect(rec.batch).toHaveBeenCalledTimes(1);
      expect(rec.queries).toHaveLength(0);
    });

    it("reports post-batch scores read back from storage", async () => {
      const rec = createTrustDb([seedRow()]);

      const results = await evolveTrustBatch(rec.db, [
        { domain: "seeded.example.com", success: true },
      ]);

      expect(results[0]?.domain).toBe("seeded.example.com");
      expect(results[0]?.new_score).toBeCloseTo(0.55, 10);
      expect(results[0]?.previous_score).toBeCloseTo(0.5, 10);
      expect(results[0]?.total_deals).toBe(1);
      expect(results[0]?.successful_deals).toBe(1);
    });

    it("defaults missing post-batch rows to base values", async () => {
      const rec = createTrustDb([], {
        readbackMisses: ["ghost.example.com"],
      });

      const results = await evolveTrustBatch(rec.db, [
        { domain: "ghost.example.com", success: true },
      ]);

      expect(results[0]?.previous_score).toBe(0.5);
      expect(results[0]?.new_score).toBe(0.5);
      expect(results[0]?.successful_deals).toBe(1);
    });

    it("lands a brand-new batched domain at the 0.5 insert base, not the adjusted score", async () => {
      const rec = createTrustDb();

      const results = await evolveTrustBatch(rec.db, [
        { domain: "fresh.example.com", success: true },
      ]);

      expect(results[0]?.adjustment).toBe(0.05);
      expect(results[0]?.new_score).toBeCloseTo(0.5, 10);
    });

    it("evolves an existing batched domain relative to its stored score", async () => {
      const rec = createTrustDb([seedRow({ trust_score: 0.6 })]);

      const results = await evolveTrustBatch(rec.db, [
        { domain: "seeded.example.com", success: false },
      ]);

      expect(results[0]?.new_score).toBeCloseTo(0.58, 10);
      expect(results[0]?.successful_deals).toBe(0);
    });
  });

  // ==========================================================================
  // getTrustScore / getTrustScores
  // ==========================================================================

  describe("getTrustScore", () => {
    it("returns the stored row for a known domain", async () => {
      const rec = createTrustDb([
        seedRow({ trust_score: 0.72, total_deals: 9, successful_deals: 8 }),
      ]);

      const result = await getTrustScore(rec.db, "seeded.example.com");

      expect(result?.trust_score).toBe(0.72);
      expect(result?.total_deals).toBe(9);
      expect(result?.successful_deals).toBe(8);
    });

    it("returns null when the domain is absent", async () => {
      const rec = createTrustDb();

      const result = await getTrustScore(rec.db, "missing.example.com");

      expect(result).toBeNull();
    });

    it("degrades to null when the query fails permanently", async () => {
      const rec = createTrustDb();
      vi.spyOn(rec.db, "prepare").mockImplementation(() => {
        throw new Error("no such table: trust_scores");
      });

      const result = await getTrustScore(rec.db, "any.example.com");

      expect(result).toBeNull();
    });
  });

  describe("getTrustScores", () => {
    it("returns an empty map without querying for empty input", async () => {
      const rec = createTrustDb();

      const result = await getTrustScores(rec.db, []);

      expect(result.size).toBe(0);
      expect(rec.queries).toHaveLength(0);
    });

    it("maps only the domains that exist", async () => {
      const rec = createTrustDb([
        seedRow({ domain: "a.example.com" }),
        seedRow({ domain: "b.example.com" }),
      ]);

      const result = await getTrustScores(rec.db, [
        "a.example.com",
        "b.example.com",
        "missing.example.com",
      ]);

      expect(result.size).toBe(2);
      expect(result.has("a.example.com")).toBe(true);
      expect(result.has("b.example.com")).toBe(true);
      expect(result.has("missing.example.com")).toBe(false);
    });
  });

  // ==========================================================================
  // getTopTrustedDomains / getDomainsNeedingReview
  // ==========================================================================

  describe("getTopTrustedDomains", () => {
    it("filters to trusted classifications and applies the limit", async () => {
      const rec = createTrustDb();

      await getTopTrustedDomains(rec.db, 5);

      const sql = rec.queries[0]?.sql ?? "";
      expect(sql).toContain("classification = 'trusted'");
      expect(sql).toContain("LIMIT ?");
      expect(rec.queries[0]?.params).toEqual([5]);
    });

    it("defaults the limit to 10", async () => {
      const rec = createTrustDb();

      await getTopTrustedDomains(rec.db);

      expect(rec.queries[0]?.params).toEqual([10]);
    });

    it("returns the rows found in storage", async () => {
      const rec = createTrustDb([
        seedRow({ trust_score: 0.95 }),
        seedRow({ trust_score: 0.85 }),
      ]);

      const result = await getTopTrustedDomains(rec.db, 2);

      expect(result).toHaveLength(2);
      expect(result[0]?.trust_score).toBe(0.95);
    });
  });

  describe("getDomainsNeedingReview", () => {
    it("targets low scores or high failure rates and binds the threshold", async () => {
      const rec = createTrustDb();

      await getDomainsNeedingReview(rec.db, 0.25);

      const sql = rec.queries[0]?.sql ?? "";
      expect(sql).toContain("trust_score < 0.3");
      expect(sql).toContain("successful_deals * 1.0 / total_deals < ?");
      expect(rec.queries[0]?.params).toEqual([0.25]);
    });

    it("defaults the failure threshold to 0.3", async () => {
      const rec = createTrustDb();

      await getDomainsNeedingReview(rec.db);

      expect(rec.queries[0]?.params).toEqual([0.3]);
    });

    it("returns an empty array when nothing needs review", async () => {
      const rec = createTrustDb();

      const result = await getDomainsNeedingReview(rec.db);

      expect(result).toEqual([]);
    });
  });
});
