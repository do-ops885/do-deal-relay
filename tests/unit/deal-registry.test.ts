import { describe, it, expect, vi } from "vitest";
import {
  DealRegistry,
  type StageDealInput,
} from "../../worker/durable-objects/deal-registry";

// ============================================================================
// In-memory SQLite mock for state.storage.sql
// ============================================================================
// DealRegistry uses Cloudflare DO SQLite (state.storage.sql), NOT D1.
// exec() returns a cursor with .one() and .toArray().
// ============================================================================

interface MockDealRow {
  deal_id: string;
  source: string;
  title: string;
  status: string;
  data: string;
  created_at: number;
  updated_at: number;
  [key: string]: string | number;
}

function createMockSql() {
  const storage: MockDealRow[] = [];
  let lastChangesCount = 0;

  function mockCursor(rows: unknown[]) {
    return {
      one: () => rows[0],
      toArray: () => rows,
    };
  }

  const exec = vi.fn((sql: string, ...params: unknown[]) => {
    const upperSql = sql.trimStart().toUpperCase();

    // CREATE TABLE / INDEX — no-op
    if (upperSql.startsWith("CREATE")) {
      return mockCursor([]);
    }

    // changes() — return the count from the last mutation
    if (sql.includes("changes()")) {
      return mockCursor([{ cnt: lastChangesCount }]);
    }

    // INSERT (upsert via ON CONFLICT)
    // SQL: VALUES (?, ?, ?, 'candidate', ?, ?, ?) — 6 params, 'candidate' is a literal
    if (upperSql.startsWith("INSERT")) {
      const [deal_id, source, title, data, created_at, updated_at] = params;
      const idx = storage.findIndex((r) => r.deal_id === deal_id);
      if (idx >= 0) {
        // ON CONFLICT: update source, title, data, updated_at (preserve status & created_at)
        storage[idx]!.source = String(source);
        storage[idx]!.title = String(title);
        storage[idx]!.data = String(data);
        storage[idx]!.updated_at = Number(updated_at);
      } else {
        storage.push({
          deal_id: String(deal_id),
          source: String(source),
          title: String(title),
          status: "candidate",
          data: String(data),
          created_at: Number(created_at),
          updated_at: Number(updated_at),
        });
      }
      lastChangesCount = 1;
      return mockCursor([]);
    }

    // UPDATE (publish / validate / reject)
    if (upperSql.startsWith("UPDATE")) {
      const [updated_at, deal_id] = params;
      let count = 0;

      if (sql.includes("status = 'published'")) {
        // publishDeals: validated → published
        for (const row of storage) {
          if (row.deal_id === deal_id && row.status === "validated") {
            row.status = "published";
            row.updated_at = Number(updated_at);
            count++;
          }
        }
      } else if (sql.includes("status = 'validated'")) {
        // validateDeals: candidate → validated
        for (const row of storage) {
          if (row.deal_id === deal_id && row.status === "candidate") {
            row.status = "validated";
            row.updated_at = Number(updated_at);
            count++;
          }
        }
      } else if (sql.includes("status = 'rejected'")) {
        // rejectDeals: candidate|validated → rejected
        for (const row of storage) {
          if (
            row.deal_id === deal_id &&
            (row.status === "candidate" || row.status === "validated")
          ) {
            row.status = "rejected";
            row.updated_at = Number(updated_at);
            count++;
          }
        }
      }

      lastChangesCount = count;
      return mockCursor([]);
    }

    // DELETE (purgeOld)
    if (upperSql.startsWith("DELETE")) {
      const [cutoff] = params;
      const before = storage.length;
      for (let i = storage.length - 1; i >= 0; i--) {
        const row = storage[i];
        if (
          row &&
          row.updated_at < Number(cutoff) &&
          (row.status === "published" || row.status === "rejected")
        ) {
          storage.splice(i, 1);
        }
      }
      lastChangesCount = before - storage.length;
      return mockCursor([]);
    }

    // SELECT
    if (upperSql.startsWith("SELECT")) {
      // getStats — GROUP BY status
      if (sql.includes("GROUP BY")) {
        const groups: Record<string, number> = {};
        for (const row of storage) {
          groups[row.status] = (groups[row.status] ?? 0) + 1;
        }
        return mockCursor(
          Object.entries(groups).map(([status, cnt]) => ({ status, cnt })),
        );
      }

      let results = [...storage];

      if (sql.includes("source = ?") && sql.includes("status = 'candidate'")) {
        // getCandidatesBySource
        results = results.filter(
          (r) => r.source === params[0] && r.status === "candidate",
        );
        results.sort((a, b) => b.created_at - a.created_at);
      } else if (sql.includes("status = ?") && sql.includes("LIMIT")) {
        // getDealsByStatus
        results = results.filter((r) => r.status === params[0]);
        results.sort((a, b) => b.updated_at - a.updated_at);
        results = results.slice(0, Number(params[1]));
      } else if (sql.includes("deal_id = ?")) {
        // getDeal
        results = results.filter((r) => r.deal_id === params[0]);
      }

      return mockCursor(results);
    }

    return mockCursor([]);
  });

  return { exec, storage };
}

function createMockState(mockSql: { exec: ReturnType<typeof vi.fn> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DurableObjectState
  // Container type mismatch between @cloudflare/workers-types versions;
  // the constructor only accesses state.storage.sql which we mock.
  return {
    id: { name: "test-deal-registry" },
    storage: {
      sql: mockSql,
    },
  } as any;
}

// ============================================================================
// Test helpers
// ============================================================================

function createRegistry() {
  const mockSql = createMockSql();
  const state = createMockState(mockSql);
  const registry = new DealRegistry(state);
  return { registry, storage: mockSql.storage, mockSql };
}

function makeDeal(overrides: Partial<StageDealInput> = {}): StageDealInput {
  return {
    id: `deal-${Math.random().toString(36).slice(2, 8)}`,
    source: "test-source",
    title: "Test Deal",
    data: '{"key":"value"}',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("DealRegistry", () => {
  // ==========================================================================
  // stageDeals
  // ==========================================================================
  describe("stageDeals", () => {
    it("should stage a single deal as candidate", async () => {
      const { registry, storage } = createRegistry();
      const result = await registry.stageDeals([
        makeDeal({ id: "deal-1", source: "trading212", title: "Signup Bonus" }),
      ]);

      expect(result).toBe(1);
      expect(storage).toHaveLength(1);
      expect(storage[0]!.deal_id).toBe("deal-1");
      expect(storage[0]!.source).toBe("trading212");
      expect(storage[0]!.title).toBe("Signup Bonus");
      expect(storage[0]!.status).toBe("candidate");
    });

    it("should return 0 for empty input", async () => {
      const { registry } = createRegistry();
      expect(await registry.stageDeals([])).toBe(0);
    });

    it("should stage multiple deals at once", async () => {
      const { registry, storage } = createRegistry();
      const result = await registry.stageDeals([
        makeDeal({ id: "deal-1", source: "src-a" }),
        makeDeal({ id: "deal-2", source: "src-b" }),
        makeDeal({ id: "deal-3", source: "src-a" }),
      ]);

      expect(result).toBe(3);
      expect(storage).toHaveLength(3);
      expect(storage.map((r) => r.deal_id)).toEqual(
        expect.arrayContaining(["deal-1", "deal-2", "deal-3"]),
      );
    });

    it("should upsert re-staged deals, preserving status and created_at", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1", title: "Original Title" }),
      ]);

      // Advance to validated
      await registry.validateDeals(["deal-1"]);
      expect(storage[0]!.status).toBe("validated");
      const originalCreatedAt = storage[0]!.created_at;

      // Re-stage with updated data
      await registry.stageDeals([
        makeDeal({ id: "deal-1", title: "Updated Title" }),
      ]);

      // ON CONFLICT preserves status and created_at, updates title/data/updated_at
      expect(storage).toHaveLength(1);
      expect(storage[0]!.status).toBe("validated");
      expect(storage[0]!.title).toBe("Updated Title");
      expect(storage[0]!.created_at).toBe(originalCreatedAt);
    });

    it("should set created_at and updated_at timestamps", async () => {
      const { registry, storage } = createRegistry();
      const before = Date.now();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      const after = Date.now();

      expect(storage[0]!.created_at).toBeGreaterThanOrEqual(before);
      expect(storage[0]!.created_at).toBeLessThanOrEqual(after);
      expect(storage[0]!.updated_at).toBeGreaterThanOrEqual(before);
      expect(storage[0]!.updated_at).toBeLessThanOrEqual(after);
    });
  });

  // ==========================================================================
  // validateDeals
  // ==========================================================================
  describe("validateDeals", () => {
    it("should transition candidate to validated", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);

      const affected = await registry.validateDeals(["deal-1"]);

      expect(affected).toBe(1);
      expect(storage[0]!.status).toBe("validated");
    });

    it("should return 0 for empty input", async () => {
      const { registry } = createRegistry();
      expect(await registry.validateDeals([])).toBe(0);
    });

    it("should return 0 for non-existent deal IDs", async () => {
      const { registry } = createRegistry();
      expect(await registry.validateDeals(["ghost-id"])).toBe(0);
    });

    it("should not change already-validated deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);

      const affected = await registry.validateDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("validated");
    });

    it("should not validate published deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      const affected = await registry.validateDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("published");
    });

    it("should not validate rejected deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.rejectDeals(["deal-1"]);

      const affected = await registry.validateDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("rejected");
    });

    it("should validate multiple candidate deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
        makeDeal({ id: "deal-3" }),
      ]);

      const affected = await registry.validateDeals([
        "deal-1",
        "deal-2",
        "deal-3",
      ]);

      expect(affected).toBe(3);
      expect(storage.every((r) => r.status === "validated")).toBe(true);
    });
  });

  // ==========================================================================
  // publishDeals
  // ==========================================================================
  describe("publishDeals", () => {
    it("should transition validated to published", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);

      const affected = await registry.publishDeals(["deal-1"]);

      expect(affected).toBe(1);
      expect(storage[0]!.status).toBe("published");
    });

    it("should return 0 for empty input", async () => {
      const { registry } = createRegistry();
      expect(await registry.publishDeals([])).toBe(0);
    });

    it("should return 0 for non-existent deal IDs", async () => {
      const { registry } = createRegistry();
      expect(await registry.publishDeals(["ghost-id"])).toBe(0);
    });

    it("should not publish candidate deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);

      const affected = await registry.publishDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("candidate");
    });

    it("should not publish already-published deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      const affected = await registry.publishDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("published");
    });

    it("should not publish rejected deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.rejectDeals(["deal-1"]);

      const affected = await registry.publishDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("rejected");
    });

    it("should publish multiple validated deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
        makeDeal({ id: "deal-3" }),
      ]);
      await registry.validateDeals(["deal-1", "deal-2", "deal-3"]);

      const affected = await registry.publishDeals([
        "deal-1",
        "deal-2",
        "deal-3",
      ]);

      expect(affected).toBe(3);
      expect(storage.every((r) => r.status === "published")).toBe(true);
    });

    it("should only publish validated deals from mixed batch", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
      ]);
      // Only validate deal-1
      await registry.validateDeals(["deal-1"]);

      const affected = await registry.publishDeals(["deal-1", "deal-2"]);

      expect(affected).toBe(1);
      expect(storage.find((r) => r.deal_id === "deal-1")!.status).toBe(
        "published",
      );
      expect(storage.find((r) => r.deal_id === "deal-2")!.status).toBe(
        "candidate",
      );
    });
  });

  // ==========================================================================
  // rejectDeals
  // ==========================================================================
  describe("rejectDeals", () => {
    it("should reject candidate deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);

      const affected = await registry.rejectDeals(["deal-1"]);

      expect(affected).toBe(1);
      expect(storage[0]!.status).toBe("rejected");
    });

    it("should reject validated deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);

      const affected = await registry.rejectDeals(["deal-1"]);

      expect(affected).toBe(1);
      expect(storage[0]!.status).toBe("rejected");
    });

    it("should return 0 for empty input", async () => {
      const { registry } = createRegistry();
      expect(await registry.rejectDeals([])).toBe(0);
    });

    it("should return 0 for non-existent deal IDs", async () => {
      const { registry } = createRegistry();
      expect(await registry.rejectDeals(["ghost-id"])).toBe(0);
    });

    it("should not reject published deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      const affected = await registry.rejectDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("published");
    });

    it("should not reject already-rejected deals (no-op)", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.rejectDeals(["deal-1"]);

      const affected = await registry.rejectDeals(["deal-1"]);

      expect(affected).toBe(0);
      expect(storage[0]!.status).toBe("rejected");
    });

    it("should reject multiple deals from mixed statuses", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
        makeDeal({ id: "deal-3" }),
      ]);
      await registry.validateDeals(["deal-2"]);

      // deal-1 is candidate, deal-2 is validated, deal-3 is candidate
      const affected = await registry.rejectDeals([
        "deal-1",
        "deal-2",
        "deal-3",
      ]);

      expect(affected).toBe(3);
      expect(storage.every((r) => r.status === "rejected")).toBe(true);
    });
  });

  // ==========================================================================
  // getCandidatesBySource
  // ==========================================================================
  describe("getCandidatesBySource", () => {
    it("should return candidate deals for the given source", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1", source: "trading212" }),
        makeDeal({ id: "deal-2", source: "etoro" }),
        makeDeal({ id: "deal-3", source: "trading212" }),
      ]);

      const candidates = await registry.getCandidatesBySource("trading212");

      expect(candidates).toHaveLength(2);
      expect(candidates.every((d) => d.source === "trading212")).toBe(true);
      expect(candidates.every((d) => d.status === "candidate")).toBe(true);
    });

    it("should exclude non-candidate deals from results", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1", source: "trading212" }),
        makeDeal({ id: "deal-2", source: "trading212" }),
      ]);
      await registry.validateDeals(["deal-1"]);

      const candidates = await registry.getCandidatesBySource("trading212");

      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.deal_id).toBe("deal-2");
    });

    it("should return empty array when no candidates match source", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1", source: "trading212" }),
      ]);

      const candidates = await registry.getCandidatesBySource("non-existent");

      expect(candidates).toHaveLength(0);
    });

    it("should return empty array for empty table", async () => {
      const { registry } = createRegistry();
      const candidates = await registry.getCandidatesBySource("any-source");
      expect(candidates).toHaveLength(0);
    });

    it("should include all fields in returned records", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({
          id: "deal-1",
          source: "trading212",
          title: "Welcome Bonus",
          data: '{"amount":100}',
        }),
      ]);

      const candidates = await registry.getCandidatesBySource("trading212");

      expect(candidates[0]).toEqual(
        expect.objectContaining({
          deal_id: "deal-1",
          source: "trading212",
          title: "Welcome Bonus",
          status: "candidate",
          data: '{"amount":100}',
        }),
      );
      expect(candidates[0]!.created_at).toBeGreaterThan(0);
      expect(candidates[0]!.updated_at).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // getDealsByStatus
  // ==========================================================================
  describe("getDealsByStatus", () => {
    it("should return deals matching the given status", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
      ]);
      await registry.validateDeals(["deal-1"]);

      const validated = await registry.getDealsByStatus("validated");

      expect(validated).toHaveLength(1);
      expect(validated[0]!.deal_id).toBe("deal-1");
    });

    it("should respect the limit parameter", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
        makeDeal({ id: "deal-3" }),
      ]);

      const result = await registry.getDealsByStatus("candidate", 2);

      expect(result).toHaveLength(2);
    });

    it("should default limit to 100", async () => {
      const { registry } = createRegistry();
      const deals = Array.from({ length: 5 }, (_, i) =>
        makeDeal({ id: `deal-${i}` }),
      );
      await registry.stageDeals(deals);

      const result = await registry.getDealsByStatus("candidate");

      expect(result).toHaveLength(5);
    });

    it("should return empty array when no deals match status", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);

      const published = await registry.getDealsByStatus("published");

      expect(published).toHaveLength(0);
    });

    it("should return empty array for empty table", async () => {
      const { registry } = createRegistry();
      const result = await registry.getDealsByStatus("candidate");
      expect(result).toHaveLength(0);
    });
  });

  // ==========================================================================
  // getDeal
  // ==========================================================================
  describe("getDeal", () => {
    it("should return a deal by ID", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1", title: "My Deal" })]);

      const deal = await registry.getDeal("deal-1");

      expect(deal).not.toBeNull();
      expect(deal!.deal_id).toBe("deal-1");
      expect(deal!.title).toBe("My Deal");
      expect(deal!.status).toBe("candidate");
    });

    it("should return null for non-existent deal", async () => {
      const { registry } = createRegistry();
      const deal = await registry.getDeal("non-existent");
      expect(deal).toBeNull();
    });

    it("should return deal after status transitions", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      const deal = await registry.getDeal("deal-1");

      expect(deal!.status).toBe("published");
    });

    it("should return all fields in the record", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({
          id: "deal-1",
          source: "trading212",
          title: "Bonus",
          data: '{"amount":50}',
        }),
      ]);

      const deal = await registry.getDeal("deal-1");

      expect(deal).toEqual(
        expect.objectContaining({
          deal_id: "deal-1",
          source: "trading212",
          title: "Bonus",
          status: "candidate",
          data: '{"amount":50}',
        }),
      );
    });
  });

  // ==========================================================================
  // getStats
  // ==========================================================================
  describe("getStats", () => {
    it("should return zero total for empty registry", async () => {
      const { registry } = createRegistry();
      const stats = await registry.getStats();

      expect(stats.total).toBe(0);
    });

    it("should count deals by status", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
        makeDeal({ id: "deal-3" }),
      ]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      const stats = await registry.getStats();

      // After publish: deal-1=published, deal-2=candidate, deal-3=candidate
      expect(stats.candidate).toBe(2);
      expect(stats.published).toBe(1);
      expect(stats.total).toBe(3);
    });

    it("should include total field", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);

      const stats = await registry.getStats();

      expect(stats).toHaveProperty("total");
      expect(stats.total).toBe(1);
    });

    it("should reflect rejected count", async () => {
      const { registry } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
      ]);
      await registry.rejectDeals(["deal-1"]);

      const stats = await registry.getStats();

      expect(stats.candidate).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.total).toBe(2);
    });
  });

  // ==========================================================================
  // purgeOld
  // ==========================================================================
  describe("purgeOld", () => {
    it("should delete old published deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      // Artificially age the deal
      storage[0]!.updated_at = Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);

      expect(purged).toBe(1);
    });

    it("should delete old rejected deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.rejectDeals(["deal-1"]);

      // Artificially age the deal
      storage[0]!.updated_at = Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);

      expect(purged).toBe(1);
    });

    it("should NOT delete old candidate deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);

      storage[0]!.updated_at = Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);

      expect(purged).toBe(0);
      expect(storage).toHaveLength(1);
    });

    it("should NOT delete old validated deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);

      storage[0]!.updated_at = Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);

      expect(purged).toBe(0);
      expect(storage).toHaveLength(1);
    });

    it("should NOT delete recent published deals", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      // Keep updated_at recent (within maxAge)
      storage[0]!.updated_at = Date.now();

      const purged = await registry.purgeOld(1_000_000);

      expect(purged).toBe(0);
      expect(storage).toHaveLength(1);
    });

    it("should return 0 for empty table", async () => {
      const { registry } = createRegistry();
      const purged = await registry.purgeOld(1_000_000);
      expect(purged).toBe(0);
    });

    it("should only delete qualifying deals, preserving others", async () => {
      const { registry, storage } = createRegistry();
      await registry.stageDeals([
        makeDeal({ id: "deal-1" }),
        makeDeal({ id: "deal-2" }),
        makeDeal({ id: "deal-3" }),
      ]);
      await registry.validateDeals(["deal-1", "deal-2"]);
      await registry.publishDeals(["deal-1"]);
      await registry.rejectDeals(["deal-2"]);
      // deal-3 stays candidate

      // Age deal-1 and deal-2, keep deal-3 recent
      storage.find((r) => r.deal_id === "deal-1")!.updated_at =
        Date.now() - 2_000_000;
      storage.find((r) => r.deal_id === "deal-2")!.updated_at =
        Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);

      expect(purged).toBe(2);
      expect(storage).toHaveLength(1);
      expect(storage[0]!.deal_id).toBe("deal-3");
    });
  });

  // ==========================================================================
  // fetch
  // ==========================================================================
  describe("fetch", () => {
    it("should return a 200 response", async () => {
      const { registry } = createRegistry();
      const response = await registry.fetch();

      expect(response.status).toBe(200);
    });

    it("should include DealRegistry DO in the body", async () => {
      const { registry } = createRegistry();
      const response = await registry.fetch();
      const text = await response.text();

      expect(text).toContain("DealRegistry DO");
      expect(text).toContain("RPC methods");
    });
  });

  // ==========================================================================
  // Full lifecycle integration tests
  // ==========================================================================
  describe("full lifecycle", () => {
    it("stage → validate → publish → getDeal → getStats", async () => {
      const { registry } = createRegistry();

      // Stage
      await registry.stageDeals([
        makeDeal({ id: "deal-1", title: "Lifecycle Deal" }),
      ]);
      let deal = await registry.getDeal("deal-1");
      expect(deal!.status).toBe("candidate");

      // Validate
      await registry.validateDeals(["deal-1"]);
      deal = await registry.getDeal("deal-1");
      expect(deal!.status).toBe("validated");

      // Publish
      await registry.publishDeals(["deal-1"]);
      deal = await registry.getDeal("deal-1");
      expect(deal!.status).toBe("published");

      // Stats
      const stats = await registry.getStats();
      expect(stats.published).toBe(1);
      expect(stats.total).toBe(1);
    });

    it("stage → validate → publish → purge", async () => {
      const { registry, storage } = createRegistry();

      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      // Age the deal past maxAge
      storage[0]!.updated_at = Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);
      expect(purged).toBe(1);

      // Verify deal is gone
      const deal = await registry.getDeal("deal-1");
      expect(deal).toBeNull();

      const stats = await registry.getStats();
      expect(stats.total).toBe(0);
    });

    it("stage → reject → purge", async () => {
      const { registry, storage } = createRegistry();

      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.rejectDeals(["deal-1"]);

      storage[0]!.updated_at = Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);
      expect(purged).toBe(1);

      const stats = await registry.getStats();
      expect(stats.total).toBe(0);
    });

    it("stage → validate → reject → purge", async () => {
      const { registry, storage } = createRegistry();

      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.rejectDeals(["deal-1"]);

      storage[0]!.updated_at = Date.now() - 2_000_000;

      const purged = await registry.purgeOld(1_000_000);
      expect(purged).toBe(1);
    });

    it("multiple deals through mixed lifecycle paths", async () => {
      const { registry } = createRegistry();

      await registry.stageDeals([
        makeDeal({ id: "deal-1", source: "trading212" }),
        makeDeal({ id: "deal-2", source: "trading212" }),
        makeDeal({ id: "deal-3", source: "etoro" }),
      ]);

      // deal-1: candidate → validated → published
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      // deal-2: candidate → rejected
      await registry.rejectDeals(["deal-2"]);

      // deal-3 stays candidate

      // Verify stats
      const stats = await registry.getStats();
      expect(stats.published).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.candidate).toBe(1);
      expect(stats.total).toBe(3);

      // Verify getCandidatesBySource
      // trading212: deal-1 is published, deal-2 is rejected → 0 candidates
      const trading212Candidates =
        await registry.getCandidatesBySource("trading212");
      expect(trading212Candidates).toHaveLength(0);

      // etoro: deal-3 is candidate → 1 candidate
      const etoroCandidates = await registry.getCandidatesBySource("etoro");
      expect(etoroCandidates).toHaveLength(1);
      expect(etoroCandidates[0]!.deal_id).toBe("deal-3");

      // Verify getDealsByStatus
      const published = await registry.getDealsByStatus("published");
      expect(published).toHaveLength(1);
      expect(published[0]!.deal_id).toBe("deal-1");

      const rejected = await registry.getDealsByStatus("rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.deal_id).toBe("deal-2");

      const candidates = await registry.getDealsByStatus("candidate");
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.deal_id).toBe("deal-3");
    });

    it("re-staging deal that was already published preserves published status", async () => {
      const { registry } = createRegistry();

      // Full lifecycle to published
      await registry.stageDeals([makeDeal({ id: "deal-1" })]);
      await registry.validateDeals(["deal-1"]);
      await registry.publishDeals(["deal-1"]);

      let deal = await registry.getDeal("deal-1");
      expect(deal!.status).toBe("published");

      // Re-stage same ID — status should be preserved (ON CONFLICT doesn't touch status)
      await registry.stageDeals([
        makeDeal({ id: "deal-1", title: "New Title" }),
      ]);

      deal = await registry.getDeal("deal-1");
      expect(deal!.status).toBe("published");
      expect(deal!.title).toBe("New Title");
    });
  });
});
