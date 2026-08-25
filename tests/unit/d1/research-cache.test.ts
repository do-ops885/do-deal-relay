/**
 * Unit tests for worker/lib/d1/research-cache.ts
 *
 * Covers getResearchCache, putResearchCache, getResearchCacheBatch, and
 * putResearchCacheBatch: empty-input no-ops, JSON (de)serialization,
 * malformed-payload tolerance, key/payload length validation,
 * MAX_BATCH_SIZE truncation, and error propagation.
 *
 * A local recording double is used because the shared lock-oriented
 * fixture cannot return configurable cache rows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  getResearchCache,
  putResearchCache,
  getResearchCacheBatch,
  putResearchCacheBatch,
} from "../../../worker/lib/d1/research-cache";

// ============================================================================
// Recording mock with configurable read results
// ============================================================================

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/**
 * Minimal D1 test double that records every bound statement and returns
 * configurable results for `first`/`all` reads.
 * Cast rationale: only implements the D1Database surface exercised by the
 * module under test (prepare/bind/run/batch); the single widening here keeps
 * individual mocks fully typed without per-call casts.
 */
function createCacheDb(
  options: {
    firstResult?: unknown;
    allResults?: unknown[];
  } = {},
) {
  const queries: RecordedQuery[] = [];
  const run = vi.fn(async () => ({ results: [], meta: {} }));
  const first = vi.fn(async () => options.firstResult ?? null);
  const all = vi.fn(async () => ({ results: options.allResults ?? [] }));
  const batch = vi.fn(async (statements: unknown[]) =>
    statements.map(() => ({ results: [], meta: {} })),
  );

  const prepare = vi.fn((sql: string) => ({
    bind: (...params: unknown[]) => {
      queries.push({ sql, params });
      return { run, first, all };
    },
    run,
    first,
    all,
  }));

  const db = { prepare, batch } as unknown as D1Database;

  return { db, queries, prepare, batch, run, first, all };
}

describe("d1/research-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // getResearchCacheBatch
  // ==========================================================================

  describe("getResearchCacheBatch", () => {
    it("returns an empty map without querying for an empty key list", async () => {
      const rec = createCacheDb();

      const result = await getResearchCacheBatch(rec.db, []);

      expect(result.size).toBe(0);
      expect(rec.prepare).not.toHaveBeenCalled();
    });

    it("fetches and parses payloads in a single round-trip", async () => {
      const rec = createCacheDb({
        allResults: [
          { key: "k1", payload: JSON.stringify({ deals: [1, 2] }) },
          { key: "k2", payload: JSON.stringify("plain") },
        ],
      });

      const result = await getResearchCacheBatch(rec.db, ["k1", "k2"]);

      expect(result.get("k1")).toEqual({ deals: [1, 2] });
      expect(result.get("k2")).toBe("plain");
      expect(result.size).toBe(2);
      expect(rec.prepare).toHaveBeenCalledTimes(1);
      expect(rec.all).toHaveBeenCalledTimes(1);
    });

    it("builds positional placeholders matching the key count", async () => {
      const rec = createCacheDb();
      const keys = ["k1", "k2", "k3"];

      await getResearchCacheBatch(rec.db, keys);

      expect(rec.queries[0]?.sql).toContain("FROM research_cache_kv");
      expect(rec.queries[0]?.sql).toContain("IN (?1, ?2, ?3)");
      expect(rec.queries[0]?.params).toEqual(keys);
    });

    it("skips rows with malformed JSON instead of failing", async () => {
      const rec = createCacheDb({
        allResults: [
          { key: "bad", payload: "{not valid json" },
          { key: "good", payload: JSON.stringify({ ok: true }) },
        ],
      });

      const result = await getResearchCacheBatch(rec.db, ["bad", "good"]);

      expect(result.has("bad")).toBe(false);
      expect(result.get("good")).toEqual({ ok: true });
      expect(result.size).toBe(1);
    });

    it("ignores non-object rows in the D1 response", async () => {
      const rec = createCacheDb({
        allResults: [null, undefined, { key: "k", payload: "[7]" }],
      });

      const result = await getResearchCacheBatch(rec.db, ["k"]);

      expect(result.size).toBe(1);
      expect(result.get("k")).toEqual([7]);
    });

    it("caps lookups at 100 keys per query", async () => {
      const rec = createCacheDb();
      const keys = Array.from({ length: 120 }, (_, i) => `key-${i}`);

      await getResearchCacheBatch(rec.db, keys);

      const query = rec.queries[0];
      expect(query?.params).toHaveLength(100);
      expect(query?.params[99]).toBe("key-99");
      const sql = query?.sql ?? "";
      expect(sql.includes("?100")).toBe(true);
      expect(sql.includes("?101")).toBe(false);
    });
  });

  // ==========================================================================
  // putResearchCacheBatch
  // ==========================================================================

  describe("putResearchCacheBatch", () => {
    it("is a no-op for empty input", async () => {
      const rec = createCacheDb();

      await expect(
        putResearchCacheBatch(rec.db, [], []),
      ).resolves.toBeUndefined();

      expect(rec.prepare).not.toHaveBeenCalled();
      expect(rec.batch).not.toHaveBeenCalled();
    });

    it("rejects mismatched key/payload lengths before touching D1", async () => {
      const rec = createCacheDb();

      await expect(
        putResearchCacheBatch(rec.db, ["k1", "k2"], [{ a: 1 }]),
      ).rejects.toThrow(/keys \(2\) and payloads \(1\) length mismatch/);

      await expect(
        putResearchCacheBatch(rec.db, ["k1"], [{ a: 1 }, { b: 2 }]),
      ).rejects.toThrow(/keys \(1\) and payloads \(2\) length mismatch/);

      expect(rec.prepare).not.toHaveBeenCalled();
      expect(rec.batch).not.toHaveBeenCalled();
    });

    it("upserts every entry in one atomic batch with shared timestamps", async () => {
      const rec = createCacheDb();

      await putResearchCacheBatch(rec.db, ["k1", "k2"], [{ deals: 1 }, [2, 3]]);

      expect(rec.batch).toHaveBeenCalledTimes(1);
      expect(rec.queries).toHaveLength(2);
      expect(rec.queries.map((q) => q.params[0])).toEqual(["k1", "k2"]);
      expect(rec.queries[0]?.params[1]).toBe(JSON.stringify({ deals: 1 }));
      expect(rec.queries[1]?.params[1]).toBe(JSON.stringify([2, 3]));
      expect(rec.queries[0]?.sql).toContain("ON CONFLICT(key) DO UPDATE");

      // created_at and updated_at are bound once and reused (?3)
      const stamps = new Set(rec.queries.map((q) => q.params[2]));
      expect(stamps.size).toBe(1);
      const stamp = String(rec.queries[0]?.params[2]);
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("caps writes at 100 entries per batch", async () => {
      const rec = createCacheDb();
      const keys = Array.from({ length: 125 }, (_, i) => `key-${i}`);
      const payloads = keys.map((_, i) => ({ index: i }));

      await putResearchCacheBatch(rec.db, keys, payloads);

      expect(rec.batch).toHaveBeenCalledTimes(1);
      expect(rec.queries).toHaveLength(100);
      const writtenKeys = rec.queries.map((q) => q.params[0]);
      expect(writtenKeys).toContain("key-0");
      expect(writtenKeys).toContain("key-99");
      expect(writtenKeys).not.toContain("key-124");
    });
  });

  // ==========================================================================
  // getResearchCache
  // ==========================================================================

  describe("getResearchCache", () => {
    it("returns the parsed payload for a cached key", async () => {
      const rec = createCacheDb({
        firstResult: { payload: JSON.stringify({ hits: 9 }) },
      });

      const result = await getResearchCache(rec.db, "k1");

      expect(result).toEqual({ hits: 9 });
      expect(rec.queries[0]?.sql).toContain("WHERE key = ?1");
      expect(rec.queries[0]?.params).toEqual(["k1"]);
    });

    it("returns null when the key is absent", async () => {
      const rec = createCacheDb();

      await expect(getResearchCache(rec.db, "missing")).resolves.toBeNull();
    });

    it("returns null when the stored payload is malformed JSON", async () => {
      const rec = createCacheDb({ firstResult: { payload: "{broken" } });

      await expect(getResearchCache(rec.db, "corrupt")).resolves.toBeNull();
    });
  });

  // ==========================================================================
  // putResearchCache
  // ==========================================================================

  describe("putResearchCache", () => {
    it("stores the JSON payload with ISO timestamps via upsert SQL", async () => {
      const rec = createCacheDb();

      await putResearchCache(rec.db, "k1", { cached: true });

      expect(rec.run).toHaveBeenCalledTimes(1);
      expect(rec.queries[0]?.sql).toContain("INSERT INTO research_cache_kv");
      expect(rec.queries[0]?.sql).toContain("ON CONFLICT(key) DO UPDATE");
      expect(rec.queries[0]?.params[0]).toBe("k1");
      expect(rec.queries[0]?.params[1]).toBe(JSON.stringify({ cached: true }));
      expect(String(rec.queries[0]?.params[2])).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it("propagates write failures to the caller", async () => {
      const rec = createCacheDb();
      rec.run.mockRejectedValueOnce(new Error("D1 write timeout"));

      await expect(putResearchCache(rec.db, "k1", 1)).rejects.toThrow(
        "D1 write timeout",
      );
    });
  });
});
