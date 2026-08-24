/**
 * Unit tests for worker/lib/d1/audit-log.ts
 *
 * Covers logAuditEvent (single insert) and logAuditEventsBatch (atomic
 * multi-row insert with MAX_BATCH_SIZE truncation and empty-input no-op).
 *
 * Behavioral tests use the shared D1 mock fixture; parameter-binding
 * assertions use a small local recording double because the fixture does
 * not expose bound parameters.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  logAuditEvent,
  logAuditEventsBatch,
  type AuditEvent,
} from "../../../worker/lib/d1/audit-log";
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

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    action: "referral.create",
    ...overrides,
  };
}

describe("d1/audit-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // logAuditEvent
  // ==========================================================================

  describe("logAuditEvent", () => {
    it("binds every audit field in column order", async () => {
      const rec = createRecordingDb();
      const details = { code: "SAVE20", channel: "email" };

      await logAuditEvent(rec.db, {
        id: "evt-full",
        userId: "user-7",
        action: "referral.create",
        resource: "/api/referrals",
        resourceType: "referral",
        resourceId: "ref-9",
        details,
        ipAddress: "10.0.0.1",
        userAgent: "vitest-agent",
        correlationId: "corr-42",
      });

      expect(rec.queries).toHaveLength(1);
      expect(rec.queries[0]?.sql).toContain("INSERT INTO audit_log");
      expect(rec.queries[0]?.params).toEqual([
        "evt-full",
        "user-7",
        "referral.create",
        "/api/referrals",
        "referral",
        "ref-9",
        JSON.stringify(details),
        "10.0.0.1",
        "vitest-agent",
        "corr-42",
      ]);
      expect(rec.run).toHaveBeenCalledTimes(1);
    });

    it("binds null for omitted optional fields", async () => {
      const rec = createRecordingDb();

      await logAuditEvent(rec.db, makeEvent({ id: "evt-min" }));

      expect(rec.queries[0]?.params).toEqual([
        "evt-min",
        null,
        "referral.create",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
    });

    it("resolves without a result value", async () => {
      const rec = createRecordingDb();

      await expect(logAuditEvent(rec.db, makeEvent())).resolves.toBeUndefined();
    });

    it("propagates statement failures to the caller", async () => {
      const rec = createRecordingDb();
      rec.run.mockRejectedValueOnce(new Error("D1 write failed"));

      await expect(logAuditEvent(rec.db, makeEvent())).rejects.toThrow(
        "D1 write failed",
      );
    });
  });

  // ==========================================================================
  // logAuditEventsBatch
  // ==========================================================================

  describe("logAuditEventsBatch", () => {
    it("issues a single batch with one bound statement per event", async () => {
      const db = createMockD1(new Map<string, LockRow>());
      const events = [
        makeEvent({ id: "evt-a" }),
        makeEvent({ id: "evt-b" }),
        makeEvent({ id: "evt-c" }),
      ];

      await logAuditEventsBatch(db, events);

      expect(db.batch).toHaveBeenCalledTimes(1);
      const batchArg = (db.batch as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(batchArg).toHaveLength(3);
    });

    it("is a no-op for an empty event list", async () => {
      const db = createMockD1(new Map<string, LockRow>());

      await expect(logAuditEventsBatch(db, [])).resolves.toBeUndefined();

      expect(db.prepare).not.toHaveBeenCalled();
      expect(db.batch).not.toHaveBeenCalled();
    });

    it("truncates oversized input to the 100-statement D1 limit", async () => {
      const db = createMockD1(new Map<string, LockRow>());
      const events = Array.from({ length: 150 }, (_, i) =>
        makeEvent({ id: `evt-${i}` }),
      );

      await logAuditEventsBatch(db, events);

      expect(db.batch).toHaveBeenCalledTimes(1);
      const batchArg = (db.batch as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0];
      expect(batchArg).toHaveLength(100);
    });

    it("never binds events dropped by the truncation window", async () => {
      const rec = createRecordingDb();
      const events = Array.from({ length: 105 }, (_, i) =>
        makeEvent({ id: `evt-${i}` }),
      );

      await logAuditEventsBatch(rec.db, events);

      expect(rec.queries).toHaveLength(100);
      expect(rec.queries[99]?.params[0]).toBe("evt-99");
      const droppedIds = rec.queries
        .map((q) => q.params[0])
        .filter((id) => id === "evt-100");
      expect(droppedIds).toHaveLength(0);
    });

    it("preserves event order and serializes details inside the batch", async () => {
      const rec = createRecordingDb();
      const first = makeEvent({ id: "evt-first" });
      const second = makeEvent({
        id: "evt-second",
        action: "deal.submit",
        details: { trusted: true },
      });

      await logAuditEventsBatch(rec.db, [first, second]);

      expect(rec.queries[0]?.params[0]).toBe("evt-first");
      expect(rec.queries[1]?.params[0]).toBe("evt-second");
      expect(rec.queries[1]?.params[1]).toBeNull();
      expect(rec.queries[1]?.params[2]).toBe("deal.submit");
      expect(rec.queries[1]?.params[6]).toBe(JSON.stringify({ trusted: true }));
    });

    it("propagates D1 batch failures", async () => {
      const db = createMockD1(new Map<string, LockRow>());
      (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("D1 unavailable"),
      );

      await expect(logAuditEventsBatch(db, [makeEvent()])).rejects.toThrow(
        "D1 unavailable",
      );
    });
  });
});
