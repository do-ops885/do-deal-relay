/**
 * Unit tests for worker/lib/d1/system-metrics.ts
 *
 * Covers writeMetric (single insert) and writeMetricsBatch (atomic
 * multi-row insert): metric type defaulting, label serialization,
 * empty-input no-op, MAX_BATCH_SIZE truncation, and error propagation.
 *
 * Behavioral tests use the shared D1 mock fixture; parameter-binding
 * assertions use a small local recording double because the fixture does
 * not expose bound parameters.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  writeMetric,
  writeMetricsBatch,
  type SystemMetric,
} from "../../../worker/lib/d1/system-metrics";
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
  const run = vi.fn(async () => ({ results: [], meta: {} }));
  const batch = vi.fn(async (statements: unknown[]) =>
    statements.map(() => ({ results: [], meta: {} })),
  );

  const prepare = vi.fn((sql: string) => ({
    bind: (...params: unknown[]) => {
      queries.push({ sql, params });
      return { run };
    },
    run,
  }));

  const db = { prepare, batch } as unknown as D1Database;

  return { db, queries, prepare, batch, run };
}

function makeMetric(overrides: Partial<SystemMetric> = {}): SystemMetric {
  return {
    name: "pipeline.deals_processed",
    value: 42,
    ...overrides,
  };
}

describe("d1/system-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // writeMetric
  // ==========================================================================

  describe("writeMetric", () => {
    it("defaults type to counter and nulls unset dimensions", async () => {
      const rec = createRecordingDb();

      await writeMetric(rec.db, makeMetric({ name: "m.min", value: 1 }));

      expect(rec.queries).toHaveLength(1);
      expect(rec.queries[0]?.sql).toContain("INSERT INTO system_metrics");
      expect(rec.queries[0]?.params).toEqual([
        "m.min",
        1,
        "counter",
        null,
        null,
        null,
        null,
      ]);
    });

    it("serializes labels to JSON and honors an explicit gauge type", async () => {
      const rec = createRecordingDb();

      await writeMetric(
        rec.db,
        makeMetric({
          type: "gauge",
          labels: { phase: "validation", region: "eeur" },
        }),
      );

      expect(rec.queries[0]?.params[2]).toBe("gauge");
      expect(rec.queries[0]?.params[3]).toBe(
        JSON.stringify({ phase: "validation", region: "eeur" }),
      );
    });

    it("binds run correlation fields when provided", async () => {
      const rec = createRecordingDb();

      await writeMetric(
        rec.db,
        makeMetric({
          type: "histogram",
          runId: "run-77",
          phase: "discovery",
          durationMs: 1234.5,
        }),
      );

      expect(rec.queries[0]?.params).toEqual([
        "pipeline.deals_processed",
        42,
        "histogram",
        null,
        "run-77",
        "discovery",
        1234.5,
      ]);
    });

    it("propagates statement failures to the caller", async () => {
      const rec = createRecordingDb();
      rec.run.mockRejectedValueOnce(new Error("D1 insert rejected"));

      await expect(writeMetric(rec.db, makeMetric())).rejects.toThrow(
        "D1 insert rejected",
      );
    });
  });

  // ==========================================================================
  // writeMetricsBatch
  // ==========================================================================

  describe("writeMetricsBatch", () => {
    it("is a no-op for an empty metric list", async () => {
      const db = createMockD1(new Map<string, LockRow>());

      await expect(writeMetricsBatch(db, [])).resolves.toBeUndefined();

      expect(db.prepare).not.toHaveBeenCalled();
      expect(db.batch).not.toHaveBeenCalled();
    });

    it("writes every metric in one batch call", async () => {
      const db = createMockD1(new Map<string, LockRow>());
      const metrics = [
        makeMetric({ name: "m.one" }),
        makeMetric({ name: "m.two" }),
        makeMetric({ name: "m.three" }),
      ];

      await writeMetricsBatch(db, metrics);

      expect(db.prepare).toHaveBeenCalledTimes(1);
      expect(db.batch).toHaveBeenCalledTimes(1);
      const batchArg = (db.batch as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(batchArg).toHaveLength(3);
    });

    it("truncates oversized input to the 100-row D1 limit", async () => {
      const db = createMockD1(new Map<string, LockRow>());
      const metrics = Array.from({ length: 130 }, (_, i) =>
        makeMetric({ name: `m.${i}` }),
      );

      await writeMetricsBatch(db, metrics);

      expect(db.batch).toHaveBeenCalledTimes(1);
      const batchArg = (db.batch as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(batchArg).toHaveLength(100);
    });

    it("defaults every metric type to counter inside a batch", async () => {
      const rec = createRecordingDb();
      const metrics = [
        makeMetric({ name: "m.a" }),
        makeMetric({ name: "m.b" }),
      ];

      await writeMetricsBatch(rec.db, metrics);

      expect(rec.queries).toHaveLength(2);
      for (const q of rec.queries) {
        expect(q.params[2]).toBe("counter");
      }
    });

    it("propagates D1 batch failures", async () => {
      const db = createMockD1(new Map<string, LockRow>());
      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("batch aborted"),
      );

      await expect(writeMetricsBatch(db, [makeMetric()])).rejects.toThrow(
        "batch aborted",
      );
    });
  });
});
