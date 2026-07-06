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
// Schema
// ============================================================================

describe("schema", () => {
  it("exports MIGRATIONS as a non-empty array", () => {
    expect(Array.isArray(MIGRATIONS)).toBe(true);
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it("each migration has version, name, up, and down", () => {
    for (const m of MIGRATIONS) {
      expect(typeof m.version).toBe("number");
      expect(typeof m.name).toBe("string");
      expect(typeof m.up).toBe("string");
      expect(typeof m.down).toBe("string");
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.up.length).toBeGreaterThan(0);
      expect(m.down.length).toBeGreaterThan(0);
    }
  });

  it("versions are sequential starting from 1", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("version 1 creates core tables (categories, deals, referral_codes)", () => {
    const v1 = MIGRATIONS[0];
    expect(v1!.name).toBe("initial_schema");
    expect(v1!.up).toContain("CREATE TABLE IF NOT EXISTS categories");
    expect(v1!.up).toContain("CREATE TABLE IF NOT EXISTS deals");
    expect(v1!.up).toContain("CREATE TABLE IF NOT EXISTS referral_codes");
    expect(v1!.up).toContain("INSERT OR IGNORE INTO categories");
  });

  it("version 1 down drops all core tables", () => {
    const v1 = MIGRATIONS[0];
    expect(v1!.down).toContain("DROP TABLE IF EXISTS referral_codes");
    expect(v1!.down).toContain("DROP TABLE IF EXISTS deals");
    expect(v1!.down).toContain("DROP TABLE IF EXISTS categories");
    expect(v1!.down).toContain("DROP TABLE IF EXISTS schema_migrations");
  });

  it("version 2 creates indexes for deals and referral_codes", () => {
    const v2 = MIGRATIONS[1];
    expect(v2!.name).toBe("add_indexes");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_deals_code");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_deals_domain");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_deals_status");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_deals_category");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_referral_codes_code");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_referral_codes_deal_id");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id");
    expect(v2!.up).toContain("CREATE INDEX IF NOT EXISTS idx_referral_codes_status");
  });

  it("version 3 adds FTS5 virtual table and triggers", () => {
    const v3 = MIGRATIONS[2];
    expect(v3!.name).toBe("add_fts");
    expect(v3!.up).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS fts_deals");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_fts_insert");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_fts_update");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_fts_delete");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_updated_at");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS referral_codes_updated_at");
  });

  it("version 4 creates analytics tables", () => {
    const v4 = MIGRATIONS[3];
    expect(v4!.name).toBe("add_analytics_tables");
    expect(v4!.up).toContain("CREATE TABLE IF NOT EXISTS referral_usage");
    expect(v4!.up).toContain("CREATE TABLE IF NOT EXISTS deal_analytics");
    expect(v4!.up).toContain("CREATE TABLE IF NOT EXISTS audit_log");
    expect(v4!.up).toContain("CREATE TABLE IF NOT EXISTS research_cache");
  });

  it("version 5 creates views", () => {
    const v5 = MIGRATIONS[4];
    expect(v5!.name).toBe("add_views");
    expect(v5!.up).toContain("CREATE VIEW IF NOT EXISTS v_active_deals");
    expect(v5!.up).toContain("CREATE VIEW IF NOT EXISTS v_expiring_deals");
    expect(v5!.up).toContain("CREATE VIEW IF NOT EXISTS v_referral_stats");
  });

  it("version 6 adds experience feedback tables", () => {
    const v6 = MIGRATIONS[5];
    expect(v6!.name).toBe("add_experience_feedback_tables");
    expect(v6!.up).toContain("CREATE TABLE IF NOT EXISTS experience_events");
    expect(v6!.up).toContain("CREATE TABLE IF NOT EXISTS experience_aggregates");
  });

  it("version 7 adds auth tables", () => {
    const v7 = MIGRATIONS[6];
    expect(v7!.name).toBe("add_auth_tables");
    expect(v7!.up).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(v7!.up).toContain("CREATE TABLE IF NOT EXISTS roles");
    expect(v7!.up).toContain("CREATE TABLE IF NOT EXISTS permissions");
    expect(v7!.up).toContain("CREATE TABLE IF NOT EXISTS role_permissions");
    expect(v7!.up).toContain("CREATE TABLE IF NOT EXISTS sessions");
    expect(v7!.up).toContain("CREATE TABLE IF NOT EXISTS api_keys_new");
  });
});

// ============================================================================
// Types
// ============================================================================

describe("types", () => {
  it("exports Migration interface compatible with MIGRATIONS elements", () => {
    const m: Migration = MIGRATIONS[0]!;
    expect(m.version).toBe(1);
    expect(m.name).toBe("initial_schema");
    expect(typeof m.up).toBe("string");
    expect(typeof m.down).toBe("string");
  });

  it("MigrationRecord has required fields", () => {
    const record: MigrationRecord = {
      version: 1,
      name: "initial_schema",
      applied_at: 1700000000,
    };
    expect(record.version).toBe(1);
    expect(record.applied_at).toBe(1700000000);
  });

  it("MigrationResult has required fields", () => {
    const result: MigrationResult = {
      success: true,
      applied: [1, 2],
      rolledBack: [],
      currentVersion: 2,
    };
    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2]);
    expect(result.error).toBeUndefined();
  });

  it("MigrationStatus has required fields", () => {
    const status: MigrationStatus = {
      currentVersion: 3,
      pending: [4, 5],
      applied: [1, 2, 3],
      latestVersion: 7,
    };
    expect(status.pending).toEqual([4, 5]);
    expect(status.latestVersion).toBe(7);
  });
});

// ============================================================================
// Index
// ============================================================================

describe("index exports", () => {
  it("re-exports MigrationRunner class", () => {
    expect(MigrationRunner).toBeDefined();
  });

  it("re-exports createMigrationRunner", () => {
    expect(typeof createMigrationRunner).toBe("function");
  });

  it("re-exports initDatabase", () => {
    expect(typeof initDatabase).toBe("function");
  });

  it("re-exports getMigrationStatus", () => {
    expect(typeof getMigrationStatus).toBe("function");
  });

  it("re-exports MIGRATIONS constant", () => {
    expect(MIGRATIONS).toBeDefined();
    expect(MIGRATIONS.length).toBe(7);
  });
});

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
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(status.latestVersion).toBe(7);
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
    expect(status.pending).toEqual([3, 4, 5, 6, 7]);
    expect(status.latestVersion).toBe(7);
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
        { version: 6, name: "add_experience_feedback_tables", applied_at: 6000 },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);
    const status = await runner.getStatus();

    expect(status.currentVersion).toBe(7);
    expect(status.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(status.pending).toEqual([]);
    expect(status.latestVersion).toBe(7);
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
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns empty applied when query data is null", async () => {
    mockQuery.mockResolvedValue({ success: true, data: null });
    const runner = new MigrationRunner(mockDb);
    const status = await runner.getStatus();

    expect(status.applied).toEqual([]);
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

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
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.rolledBack).toEqual([]);
    expect(result.currentVersion).toBe(7);
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
    expect(result.applied).toEqual([2, 3, 4, 5, 6, 7]);
    expect(result.currentVersion).toBe(7);
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
        { version: 6, name: "add_experience_feedback_tables", applied_at: 6000 },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
      ],
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(7);
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
      if (typeof sql === "string" && sql.includes("INSERT INTO schema_migrations")) {
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
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.currentVersion).toBe(7);
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
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

// ============================================================================
// Factory Functions
// ============================================================================

describe("factory functions", () => {
  const mockDb = {} as unknown as D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it("createMigrationRunner returns a MigrationRunner instance", () => {
    const runner = createMigrationRunner(mockDb);
    expect(runner).toBeInstanceOf(MigrationRunner);
  });

  it("initDatabase runs migrate on a fresh database", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });

    const result = await initDatabase(mockDb);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("initDatabase returns already-migrated result when DB is up to date", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
        { version: 4, name: "add_analytics_tables", applied_at: 4000 },
        { version: 5, name: "add_views", applied_at: 5000 },
        { version: 6, name: "add_experience_feedback_tables", applied_at: 6000 },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
      ],
    });

    const result = await initDatabase(mockDb);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(7);
  });

  it("getMigrationStatus returns current status", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });

    const status = await getMigrationStatus(mockDb);

    expect(status.currentVersion).toBe(1);
    expect(status.applied).toEqual([1]);
    expect(status.pending).toEqual([2, 3, 4, 5, 6, 7]);
    expect(status.latestVersion).toBe(7);
  });

  it("getMigrationStatus on fully migrated DB returns empty pending", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        { version: 1, name: "initial_schema", applied_at: 1000 },
        { version: 2, name: "add_indexes", applied_at: 2000 },
        { version: 3, name: "add_fts", applied_at: 3000 },
        { version: 4, name: "add_analytics_tables", applied_at: 4000 },
        { version: 5, name: "add_views", applied_at: 5000 },
        { version: 6, name: "add_experience_feedback_tables", applied_at: 6000 },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
      ],
    });

    const status = await getMigrationStatus(mockDb);

    expect(status.pending).toEqual([]);
    expect(status.currentVersion).toBe(7);
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
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("handles query returning null data", async () => {
    mockQuery.mockResolvedValue({ success: true, data: null });
    const runner = new MigrationRunner(mockDb);

    const status = await runner.getStatus();

    expect(status.applied).toEqual([]);
    expect(status.pending).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("migrate with targetVersion=0 applies nothing", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.migrate(0);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(0);
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
    expect(status.pending).toEqual([2, 4, 5, 6]);
    expect(status.currentVersion).toBe(7);
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
            { version: 6, name: "add_experience_feedback_tables", applied_at: 6000 },
            { version: 7, name: "add_auth_tables", applied_at: 7000 },
          ],
        };
      }
      return { success: true, data: [] };
    });
    const runner = new MigrationRunner(mockDb);

    const result = await runner.fresh();

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("migration up SQL contains expected DDL keywords", () => {
    for (const m of MIGRATIONS) {
      const hasCreateOrInsert =
        m.up.includes("CREATE") || m.up.includes("INSERT");
      expect(hasCreateOrInsert).toBe(true);
    }
  });

  it("migration down SQL contains expected DROP statements", () => {
    for (const m of MIGRATIONS) {
      const hasDropOrDropIndex =
        m.down.includes("DROP");
      expect(hasDropOrDropIndex).toBe(true);
    }
  });
});
