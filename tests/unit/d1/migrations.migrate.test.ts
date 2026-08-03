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
// MigrationRunner - migrate
// ============================================================================

describe("MigrationRunner migrate", () => {
  const mockDb = {} as unknown as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("applies all pending migrations when no current version", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.rolledBack).toEqual([]);
    expect(result.currentVersion).toBe(9);
    expect(result.error).toBeUndefined();
  });

  it("applies only pending migrations", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.currentVersion).toBe(9);
  });

  it("applies nothing when already at latest version", async () => {
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
        { version: 9, name: "add_trust_scores", applied_at: 9000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(9);
  });

  it("respects targetVersion and only applies up to that version", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(3);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2, 3]);
    expect(result.currentVersion).toBe(3);
  });

  it("applies nothing when targetVersion is below current version", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(1);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(2);
  });

  it("records each migration in schema_migrations table", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    await runner.migrate(1);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO schema_migrations"),
      [1, "initial_schema"],
    );
  });

  it("records multiple migrations in order", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(3);

    expect(result.applied).toEqual([1, 2, 3]);
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockExecute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("INSERT INTO schema_migrations"),
      [1, "initial_schema"],
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO schema_migrations"),
      [2, "add_indexes"],
    );
    expect(mockExecute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO schema_migrations"),
      [3, "add_fts"],
    );
  });

  it("returns failure when migration raw execution fails", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({
      success: false,
      error: "table already exists",
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(1);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Migration 1 (initial_schema) failed");
    expect(result.error).toContain("table already exists");
    expect(result.applied).toEqual([]);
  });

  it("returns failure when migration raw throws an Error", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockRejectedValueOnce(new Error("CREATE TABLE failed"));
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(1);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Migration 1");
    expect(result.error).toContain("CREATE TABLE failed");
    expect(result.applied).toEqual([]);
  });

  it("returns failure when migration raw throws a non-Error value", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockRejectedValueOnce("string error");
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(1);

    expect(result.success).toBe(false);
    expect(result.error).toContain("string error");
  });

  it("stops applying after first failure and returns partial results", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const rawCalls: string[] = [];
    mockRaw.mockImplementation(async (sql: string) => {
      rawCalls.push(sql);
      if (rawCalls.length === 3) {
        return { success: false, error: "index creation failed" };
      }
      return { success: true };
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(3);

    expect(result.success).toBe(false);
    expect(result.applied).toEqual([1]);
    expect(result.error).toContain("Migration 2 (add_indexes) failed");
  });

  it("does not record migration in DB when raw fails", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: false, error: "SQL error" });
    const runner = new MigrationRunner(mockDb);

    await runner.migrate(1);

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("applies migrations in version order", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const appliedVersions: number[] = [];
    mockExecute.mockImplementation(async (sql: string, params: unknown[]) => {
      if (
        typeof sql === "string" &&
        sql.includes("INSERT INTO schema_migrations")
      ) {
        appliedVersions.push(params[0] as number);
      }
      return { success: true };
    });
    const runner = new MigrationRunner(mockDb);

    await runner.migrate(3);

    expect(appliedVersions).toEqual([1, 2, 3]);
  });
});

// ============================================================================
// MigrationRunner - reset
// ============================================================================

describe("MigrationRunner reset", () => {
  const mockDb = {} as unknown as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("rolls back all applied migrations", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.reset();

    expect(result.success).toBe(true);
    expect(result.rolledBack).toEqual([3, 2, 1]);
    expect(result.currentVersion).toBe(0);
  });

  it("returns success immediately when no migrations applied", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.reset();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.rolledBack).toEqual([]);
    expect(result.currentVersion).toBe(0);
  });

  it("propagates rollback failure", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: false, error: "cannot drop" });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.reset();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rollback 1");
  });
});

// ============================================================================
// MigrationRunner - fresh
// ============================================================================

describe("MigrationRunner fresh", () => {
  const mockDb = {} as unknown as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("resets and then re-applies all migrations", async () => {
    let queryCall = 0;
    mockQuery.mockImplementation(async () => {
      queryCall++;
      if (queryCall === 1) {
        return {
          success: true,
          data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
        };
      }
      return { success: true, data: [] };
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.fresh();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.currentVersion).toBe(9);
  });

  it("returns reset failure without attempting migrate", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: true });
    mockRaw.mockResolvedValueOnce({ success: false, error: "cannot reset" });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.fresh();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rollback 1");
  });

  it("fresh on already clean database applies all migrations", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.fresh();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
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

  it("migrate with targetVersion=0 applies nothing", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(0);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(0);
  });

  it("migration SQL comments are stripped before execution", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    await runner.migrate(1);

    const rawSql = mockRaw.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("CREATE TABLE IF NOT EXISTS categories"),
    )?.[0] as string | undefined;
    expect(rawSql).toBeDefined();
    expect(rawSql).not.toMatch(/^--/m);
  });

  it("migrate with targetVersion exactly at current version applies nothing", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(1);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(1);
  });

  it("fresh on fully migrated DB resets then re-applies all", async () => {
    let queryCall = 0;
    mockQuery.mockImplementation(async () => {
      queryCall++;
      if (queryCall <= 1) {
        return {
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
            { version: 9, name: "add_trust_scores", applied_at: 9000 },
          ],
        };
      }
      return { success: true, data: [] };
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.fresh();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
