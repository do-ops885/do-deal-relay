import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  recordDelivery,
  hasDelivered,
} from "../../../worker/lib/d1/alert-deliveries";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

interface ScriptedDbOptions {
  runChanges?: number[];
  firstRows?: Array<unknown>;
  failReads?: boolean;
}

function createScriptedDb(options: ScriptedDbOptions = {}) {
  const queries: RecordedQuery[] = [];
  const runQueue = [...(options.runChanges ?? [])];
  const firstQueue = [...(options.firstRows ?? [])];
  const shouldFail = options.failReads ?? false;

  const prepare = vi.fn((sql: string) => {
    const run = vi.fn(async () => {
      const changes = runQueue.shift() ?? 0;
      return { success: true, meta: { changes } };
    });
    const first = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("D1 read failed");
      }
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

  const db = {
    prepare,
    withSession: vi.fn(() => ({
      prepare,
      getBookmark: vi.fn(() => "bookmark-test"),
    })),
  } as unknown as D1Database;

  return { db, queries };
}

describe("d1/alert-deliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordDelivery", () => {
    it("returns true on first insert with idempotency SQL and JSON deal ids", async () => {
      const { db, queries } = createScriptedDb({ runChanges: [1] });

      const result = await recordDelivery(db, {
        alertId: "alert-1",
        subscriptionId: "sub-1",
        dealIds: ["deal-a", "deal-b"],
        channel: "telegram",
        status: "sent",
      });

      expect(result).toBe(true);
      expect(queries).toHaveLength(1);
      const recorded = queries[0];
      expect(recorded?.sql).toContain("INSERT OR IGNORE INTO alert_deliveries");
      expect(recorded?.params[0]).toBe("alert-1");
      expect(recorded?.params[1]).toBe("sub-1");
      expect(recorded?.params[2]).toBe(JSON.stringify(["deal-a", "deal-b"]));
    });

    it("returns false on duplicate insert when changes is zero", async () => {
      const { db, queries } = createScriptedDb({ runChanges: [0] });

      const result = await recordDelivery(db, {
        alertId: "alert-1",
        subscriptionId: "sub-1",
        dealIds: ["deal-a"],
        channel: "telegram",
        status: "sent",
      });

      expect(result).toBe(false);
      expect(queries).toHaveLength(1);
      expect(queries[0]?.sql).toContain(
        "INSERT OR IGNORE INTO alert_deliveries",
      );
    });
  });

  describe("hasDelivered", () => {
    it("returns true when count is one", async () => {
      const { db } = createScriptedDb({ firstRows: [{ cnt: 1 }] });

      await expect(hasDelivered(db, "alert-1", "sub-1")).resolves.toBe(true);
    });

    it("returns false when count is zero", async () => {
      const { db } = createScriptedDb({ firstRows: [{ cnt: 0 }] });

      await expect(hasDelivered(db, "alert-1", "sub-1")).resolves.toBe(false);
    });

    it("returns false when the count query fails", async () => {
      const { db } = createScriptedDb({ failReads: true });

      await expect(hasDelivered(db, "alert-1", "sub-1")).resolves.toBe(false);
    });
  });
});
