import { describe, it, expect, vi } from "vitest";
import type { DurableObjectState } from "@cloudflare/workers-types";
import {
  SourceRegistry,
  type TrustScore,
} from "../../worker/durable-objects/source-registry";

// ============================================================================
// In-memory SQLite mock for state.storage.sql
// ============================================================================
// SourceRegistry uses Cloudflare DO SQLite (state.storage.sql).
// exec() returns a cursor with .one() and .toArray().
// ============================================================================

interface MockSourceRow {
  source_id: string;
  trust_score: number;
  total_deals: number;
  successful_deals: number;
  classification: string;
  last_seen_at: number | null;
  created_at: number;
}

function classify(score: number): string {
  if (score >= 0.7) return "trusted";
  if (score >= 0.4) return "probationary";
  return "unverified";
}

function createMockSql(storage: MockSourceRow[]) {
  function mockCursor<T>(rows: T[]) {
    return {
      one: () => rows[0],
      toArray: () => rows,
    };
  }

  const exec = vi.fn((sql: string, ...params: unknown[]) => {
    const upperSql = sql.trimStart().toUpperCase();

    if (upperSql.startsWith("CREATE")) {
      return mockCursor([]);
    }

    // Upsert: insert with base score 0.5 when the source is new.
    if (upperSql.startsWith("INSERT")) {
      const [source_id, last_seen_at, created_at] = params;
      const exists = storage.some((r) => r.source_id === source_id);
      if (!exists) {
        storage.push({
          source_id: String(source_id),
          trust_score: 0.5,
          total_deals: 0,
          successful_deals: 0,
          classification: "unverified",
          last_seen_at: Number(last_seen_at),
          created_at: Number(created_at),
        });
      }
      return mockCursor([]);
    }

    // Atomic evolution. Param order:
    // [min, max, delta, successInc, now, min, max, delta, trustedAt, min, max, delta, probationaryAt, source_id]
    if (upperSql.startsWith("UPDATE")) {
      const min = Number(params[0]);
      const max = Number(params[1]);
      const delta = Number(params[2]);
      const successInc = Number(params[3]);
      const now = Number(params[4]);
      const sourceId = String(params[13]);
      const row = storage.find((r) => r.source_id === sourceId);
      if (row) {
        const updated = Math.max(min, Math.min(max, row.trust_score + delta));
        row.trust_score = updated;
        row.total_deals += 1;
        row.successful_deals += successInc;
        row.last_seen_at = now;
        row.classification =
          updated >= Number(params[8])
            ? "trusted"
            : updated >= Number(params[12])
              ? "probationary"
              : "unverified";
      }
      return mockCursor([]);
    }

    if (upperSql.startsWith("SELECT")) {
      let results = [...storage];

      if (sql.includes("IN (")) {
        results = results.filter((r) =>
          params.map(String).includes(r.source_id),
        );
      } else if (sql.includes("WHERE source_id = ?")) {
        results = results.filter((r) => r.source_id === params[0]);
      }

      if (sql.includes("ORDER BY trust_score DESC")) {
        results.sort(
          (a, b) =>
            b.trust_score - a.trust_score ||
            b.successful_deals - a.successful_deals,
        );
        results = results.slice(0, Number(params[0]));
      }

      if (
        sql.includes("classification = 'unverified'") &&
        sql.includes("ORDER BY trust_score ASC")
      ) {
        results = results.filter(
          (r) =>
            r.classification === "unverified" ||
            (r.total_deals >= 3 && r.successful_deals / r.total_deals < 0.5),
        );
        results.sort(
          (a, b) =>
            a.trust_score - b.trust_score || b.total_deals - a.total_deals,
        );
      }

      return mockCursor(results);
    }

    return mockCursor([]);
  });

  return exec;
}

function createRegistry(seedRows: MockSourceRow[] = []) {
  const storage: MockSourceRow[] = [...seedRows];
  const exec = createMockSql(storage);
  const state = {
    id: { name: "test-source-registry" },
    storage: { sql: { exec } },
    // Cast rationale: only state.storage.sql is accessed by the class; the
    // full DurableObjectState surface is irrelevant to the unit under test.
  } as unknown as DurableObjectState;
  const registry = new SourceRegistry(state);
  return { registry, storage, exec };
}

function seedRow(overrides: Partial<MockSourceRow> = {}): MockSourceRow {
  const row: MockSourceRow = {
    source_id: "seeded-source",
    trust_score: 0.5,
    total_deals: 0,
    successful_deals: 0,
    classification: "",
    last_seen_at: null,
    created_at: 1700000000000,
    ...overrides,
  };
  // Stored rows always carry the classification matching their score.
  row.classification = classify(row.trust_score);
  return row;
}

// ============================================================================
// Tests
// ============================================================================

describe("SourceRegistry", () => {
  describe("constructor", () => {
    it("should create the sources table on init", () => {
      const { exec } = createRegistry();
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining("CREATE TABLE IF NOT EXISTS sources"),
      );
    });
  });

  describe("evolveTrust", () => {
    it("should start a new source at the 0.5 base and apply the success delta", async () => {
      const { registry } = createRegistry();

      const score = await registry.evolveTrust("src-new", true);

      expect(score).toBeCloseTo(0.55, 10);
    });

    it("should apply the failure delta to a new source", async () => {
      const { registry } = createRegistry();

      const score = await registry.evolveTrust("src-fail", false);

      expect(score).toBeCloseTo(0.48, 10);
    });

    it("should track successful and failed deals in separate counters", async () => {
      const { registry } = createRegistry();
      await registry.evolveTrust("src-counters", true);
      await registry.evolveTrust("src-counters", false);

      const info = await registry.getTrustScore("src-counters");

      expect(info?.total_deals).toBe(2);
      expect(info?.successful_deals).toBe(1);
    });

    it("should not re-apply the 0.5 base to an existing source", async () => {
      const { registry } = createRegistry();
      await registry.evolveTrust("src-repeat", true);

      const second = await registry.evolveTrust("src-repeat", true);

      expect(second).toBeCloseTo(0.6, 10);
    });

    it("should accumulate deterministically across repeated calls", async () => {
      const { registry } = createRegistry();
      await registry.evolveTrust("src-acc", true);
      await registry.evolveTrust("src-acc", false);
      await registry.evolveTrust("src-acc", true);

      const info = await registry.getTrustScore("src-acc");

      expect(info?.trust_score).toBeCloseTo(0.58, 10);
      expect(info?.total_deals).toBe(3);
      expect(info?.successful_deals).toBe(2);
    });

    it("should clamp the score at the maximum of 1.0", async () => {
      const { registry } = createRegistry([seedRow({ trust_score: 0.99 })]);

      await registry.evolveTrust("seeded-source", true);
      const clamped = await registry.evolveTrust("seeded-source", true);

      expect(clamped).toBe(1);
    });

    it("should clamp the score at the minimum of 0.0", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "low", trust_score: 0.01 }),
      ]);

      const clamped = await registry.evolveTrust("low", false);

      expect(clamped).toBe(0);
    });
  });

  describe("getTrustScore", () => {
    it("should return null for an unknown source", async () => {
      const { registry } = createRegistry();

      const result = await registry.getTrustScore("ghost");

      expect(result).toBeNull();
    });

    it("should return the full TrustScore record for a known source", async () => {
      const { registry } = createRegistry([
        seedRow({
          source_id: "known",
          trust_score: 0.75,
          total_deals: 4,
          successful_deals: 3,
          last_seen_at: 1700000001000,
        }),
      ]);

      const result = await registry.getTrustScore("known");

      expect(result).not.toBeNull();
      const info = result as TrustScore;
      expect(info.source_id).toBe("known");
      expect(info.trust_score).toBe(0.75);
      expect(info.total_deals).toBe(4);
      expect(info.successful_deals).toBe(3);
      expect(info.last_seen_at).toBe(1700000001000);
    });

    it("should derive classification as trusted at exactly 0.7", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "boundary-trusted", trust_score: 0.7 }),
      ]);

      const info = await registry.getTrustScore("boundary-trusted");

      expect(info?.classification).toBe("trusted");
    });

    it("should derive classification as probationary at exactly 0.4", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "boundary-prob", trust_score: 0.4 }),
      ]);

      const info = await registry.getTrustScore("boundary-prob");

      expect(info?.classification).toBe("probationary");
    });

    it("should derive classification as unverified below 0.4", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "low", trust_score: 0.39 }),
      ]);

      const info = await registry.getTrustScore("low");

      expect(info?.classification).toBe("unverified");
    });
  });

  describe("getTrustScores", () => {
    it("should return an empty map without querying for empty input", async () => {
      const { registry, exec } = createRegistry();
      const callsBefore = exec.mock.calls.length;

      const result = await registry.getTrustScores([]);

      expect(result.size).toBe(0);
      expect(exec.mock.calls.length).toBe(callsBefore);
    });

    it("should return only the sources that exist", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "a", trust_score: 0.5 }),
        seedRow({ source_id: "b", trust_score: 0.9 }),
      ]);

      const result = await registry.getTrustScores(["a", "b", "missing"]);

      expect(result.size).toBe(2);
      expect(result.has("a")).toBe(true);
      expect(result.has("b")).toBe(true);
      expect(result.has("missing")).toBe(false);
      expect(result.get("a")?.source_id).toBe("a");
      expect(result.get("a")?.trust_score).toBe(0.5);
    });
  });

  describe("getTopTrusted", () => {
    it("should order sources by trust score descending", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "mid", trust_score: 0.5 }),
        seedRow({ source_id: "top", trust_score: 0.95 }),
        seedRow({ source_id: "bottom", trust_score: 0.2 }),
      ]);

      const top = await registry.getTopTrusted(3);

      expect(top.map((t) => t.source_id)).toEqual(["top", "mid", "bottom"]);
    });

    it("should respect an explicit limit and default of 10", async () => {
      const seeds = Array.from({ length: 12 }, (_, i) =>
        seedRow({ source_id: `src-${i}` }),
      );
      const { registry } = createRegistry(seeds);

      expect(await registry.getTopTrusted(2)).toHaveLength(2);
      expect(await registry.getTopTrusted()).toHaveLength(10);
    });

    it("should break ties by successful deals descending", async () => {
      const { registry } = createRegistry([
        seedRow({
          source_id: "fewer-wins",
          trust_score: 0.6,
          successful_deals: 2,
        }),
        seedRow({
          source_id: "more-wins",
          trust_score: 0.6,
          successful_deals: 7,
        }),
      ]);

      const top = await registry.getTopTrusted(2);

      expect(top[0]?.source_id).toBe("more-wins");
      expect(top[1]?.source_id).toBe("fewer-wins");
    });
  });

  describe("getSourcesNeedingReview", () => {
    it("should include unverified sources regardless of history", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "fresh", trust_score: 0.35 }),
      ]);

      const review = await registry.getSourcesNeedingReview();

      expect(review.map((r) => r.source_id)).toContain("fresh");
    });

    it("should include sources with a high failure rate after 3+ deals", async () => {
      const { registry } = createRegistry([
        seedRow({
          source_id: "failing",
          trust_score: 0.45,
          total_deals: 4,
          successful_deals: 1,
        }),
      ]);

      const review = await registry.getSourcesNeedingReview();

      expect(review.map((r) => r.source_id)).toContain("failing");
    });

    it("should exclude healthy probationary sources", async () => {
      const { registry } = createRegistry([
        seedRow({
          source_id: "healthy",
          trust_score: 0.55,
          total_deals: 10,
          successful_deals: 9,
        }),
      ]);

      const review = await registry.getSourcesNeedingReview();

      expect(review.map((r) => r.source_id)).not.toContain("healthy");
    });

    it("should exclude high-trusted sources with strong track records", async () => {
      const { registry } = createRegistry([
        seedRow({
          source_id: "star",
          trust_score: 0.9,
          total_deals: 20,
          successful_deals: 19,
        }),
      ]);

      const review = await registry.getSourcesNeedingReview();

      expect(review).toHaveLength(0);
    });

    it("should order results by ascending trust score", async () => {
      const { registry } = createRegistry([
        seedRow({ source_id: "less-bad", trust_score: 0.38 }),
        seedRow({ source_id: "worst", trust_score: 0.05 }),
      ]);

      const review = await registry.getSourcesNeedingReview();

      expect(review.map((r) => r.source_id)).toEqual(["worst", "less-bad"]);
    });
  });

  describe("fetch", () => {
    it("should return a 200 response pointing callers at RPC methods", async () => {
      const { registry } = createRegistry();

      const response = await registry.fetch();

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("SourceRegistry DO");
      expect(text).toContain("RPC methods");
    });
  });

  describe("full lifecycle", () => {
    it("new source climbs from unverified to trusted through successes", async () => {
      const { registry } = createRegistry();

      let last = await registry.evolveTrust("lifecycle", true);
      expect(last).toBeCloseTo(0.55, 10);

      last = await registry.evolveTrust("lifecycle", true);
      last = await registry.evolveTrust("lifecycle", true);
      const mid = await registry.getTrustScore("lifecycle");
      expect(mid?.trust_score).toBeCloseTo(0.65, 10);
      expect(mid?.classification).toBe("probationary");

      last = await registry.evolveTrust("lifecycle", true);
      expect(last).toBeCloseTo(0.7, 10);
      const final = await registry.getTrustScore("lifecycle");
      expect(final?.classification).toBe("trusted");
      expect(final?.total_deals).toBe(4);
      expect(final?.successful_deals).toBe(4);

      const healthy = await registry.getSourcesNeedingReview();
      expect(healthy.map((r) => r.source_id)).not.toContain("lifecycle");
    });
  });
});
