import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  MIGRATIONS,
  MigrationRunner,
  createMigrationRunner,
  initDatabase,
  getMigrationStatus,
} from "../../../worker/lib/d1/migrations";
import type {
  Migration,
  MigrationRecord,
  MigrationResult,
  MigrationStatus,
} from "../../../worker/lib/d1/migrations";

const mockQuery = vi.fn();
const mockRaw = vi.fn();
const mockExecute = vi.fn();

vi.mock("../../../worker/lib/d1/client", () => ({
  createD1Client: vi.fn().mockImplementation(() => ({
    query: mockQuery,
    raw: mockRaw,
    execute: mockExecute,
  })),
}));

function resetMocks() {
  mockQuery.mockReset();
  mockRaw.mockReset();
  mockExecute.mockReset();
  mockRaw.mockResolvedValue({ success: true });
  mockExecute.mockResolvedValue({ success: true });
}

// ============================================================================
// MigrationRunner - getStatus
// ============================================================================

describe("MigrationRunner getStatus", () => {
  const mockDb = {} as unknown as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("returns empty status when no migrations applied", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);
    const status = await runner.getStatus();

    expect(status.currentVersion).toBe(0);
    expect(status.applied).toEqual([]);
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(status.latestVersion).toBe(8);
  });

  it("returns correct status when some migrations applied", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);
    const status = await runner.getStatus();

    expect(status.currentVersion).toBe(2);
    expect(status.applied).toEqual([1, 2]);
    expect(status.pending).toEqual([3, 4, 5, 6, 7, 8]);
    expect(status.latestVersion).toBe(8);
  });

  it("returns correct status when all migrations applied", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
        { version: 4, name: "add_analytics_tables", applied_at: 4000 },
        { version: 5, name: "add_views", applied_at: 5000 },
        {
          version: 6,
          name: "add_experience_feedback_tables",
          applied_at: 6000,
        },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
        { version: 8, name: "add_pipeline_locks", applied_at: 8000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);
    const status = await runner.getStatus();

    expect(status.currentVersion).toBe(8);
    expect(status.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(status.pending).toEqual([]);
    expect(status.latestVersion).toBe(8);
  });

  it("calls ensureMigrationsTable before querying", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);
    await runner.getStatus();

    expect(mockRaw).toHaveBeenCalledTimes(1);
    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_migrations"),
    );
  });

  it("returns empty applied when query fails", async () => {
    mockQuery.mockResolvedValue({ success: false, data: undefined });
    const runner = new MigrationRunner(mockDb);
    const status = await runner.getStatus();

    expect(status.applied).toEqual([]);
    expect(status.currentVersion).toBe(0);
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("returns empty applied when query data is null", async () => {
    mockQuery.mockResolvedValue({ success: true, data: null });
    const runner = new MigrationRunner(mockDb);
    const status = await runner.getStatus();

    expect(status.applied).toEqual([]);
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

// ============================================================================
// MigrationRunner - rollback
// ============================================================================

describe("MigrationRunner rollback", () => {
  const mockDb = {} as unknown as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("rolls back the most recent migration by default", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback();

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([2]);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(1);
  });

  it("rolls back multiple steps", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback(2);

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([3, 2]);
    expect(result.currentVersion).toBe(1);
  });

  it("rolls back all applied when steps exceed applied count", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback(10);

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([1]);
    expect(result.currentVersion).toBe(0);
  });

  it("returns success with empty arrays when nothing to roll back", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback();

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([]);
    expect(result.currentVersion).toBe(0);
  });

  it("deletes migration record from schema_migrations on rollback", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    await runner.rollback(1);

    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM schema_migrations WHERE version = ?",
      [2],
    );
  });

  it("deletes multiple migration records when rolling back multiple steps", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    await runner.rollback(2);

    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM schema_migrations WHERE version = ?",
      [3],
    );
    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM schema_migrations WHERE version = ?",
      [2],
    );
  });

  it("returns failure when rollback raw fails", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: false, error: "DROP failed" });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rollback 1 failed");
    expect(result.error).toContain("DROP failed");
  });

  it("returns failure when rollback raw throws", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockRejectedValueOnce(new Error("DROP failed"));
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rollback 1");
    expect(result.error).toContain("DROP failed");
  });

  it("handles non-Error thrown values during rollback", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockRejectedValueOnce(42);
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback();

    expect(result.success).toBe(false);
    expect(result.error).toContain("42");
  });

  it("stops rolling back after first failure", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
      ],
    });
    const rawCalls: string[] = [];
    mockRaw.mockImplementation(async (sql: string) => {
      rawCalls.push(sql);
      if (rawCalls.length === 3) {
        return { success: false, error: "rollback failed" };
      }
      return { success: true };
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback(3);

    expect(result.success).toBe(false);
    expect(result.rolledBack).toEqual([3]);
    expect(result.currentVersion).toBe(3);
  });

  it("does not delete migration record when raw fails", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
      ],
    });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: false, error: "fail" });
    const runner = new MigrationRunner(mockDb);

    await runner.rollback(1);

    expect(mockExecute).not.toHaveBeenCalledWith(
      "DELETE FROM schema_migrations WHERE version = ?",
      expect.anything(),
    );
  });

  it("applies empty array to result when rollback fails", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: false, error: "fail" });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback();

    expect(result.applied).toEqual([]);
  });

  it("rollback with steps=0 applies nothing", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback(0);

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([]);
    expect(result.currentVersion).toBe(1);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  const mockDb = {} as unknown as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("handles query returning undefined data", async () => {
    mockQuery.mockResolvedValue({ success: true, data: undefined });
    const runner = new MigrationRunner(mockDb);

    const status = await runner.getStatus();

    expect(status.applied).toEqual([]);
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("handles query returning null data", async () => {
    mockQuery.mockResolvedValue({ success: true, data: null });
    const runner = new MigrationRunner(mockDb);

    const status = await runner.getStatus();

    expect(status.applied).toEqual([]);
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("ensureMigrationsTable is called on every getStatus", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    await runner.getStatus();
    await runner.getStatus();

    expect(mockRaw).toHaveBeenCalledTimes(2);
    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_migrations"),
    );
  });

  it("applied migrations with non-sequential versions are handled correctly", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const status = await runner.getStatus();

    expect(status.applied).toEqual([1, 3, 7]);
    expect(status.pending).toEqual([2, 4, 5, 6, 8]);
    expect(status.currentVersion).toBe(7);
  });

  it("rollback with non-sequential applied versions removes correct records", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback(1);

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([7]);
    expect(mockExecute).toHaveBeenCalledWith(
      "DELETE FROM schema_migrations WHERE version = ?",
      [7],
    );
  });

  it("rollback of all non-sequential versions yields correct currentVersion", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.rollback(3);

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([7, 3, 1]);
    expect(result.currentVersion).toBe(0);
  });
});
