import { describe, it, expect, vi, beforeEach } from "vitest";
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
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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
    expect(v2!.up).toContain(
      "CREATE INDEX IF NOT EXISTS idx_referral_codes_code",
    );
    expect(v2!.up).toContain(
      "CREATE INDEX IF NOT EXISTS idx_referral_codes_deal_id",
    );
    expect(v2!.up).toContain(
      "CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id",
    );
    expect(v2!.up).toContain(
      "CREATE INDEX IF NOT EXISTS idx_referral_codes_status",
    );
  });

  it("version 3 adds FTS5 virtual table and triggers", () => {
    const v3 = MIGRATIONS[2];
    expect(v3!.name).toBe("add_fts");
    expect(v3!.up).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS fts_deals");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_fts_insert");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_fts_update");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_fts_delete");
    expect(v3!.up).toContain("CREATE TRIGGER IF NOT EXISTS deals_updated_at");
    expect(v3!.up).toContain(
      "CREATE TRIGGER IF NOT EXISTS referral_codes_updated_at",
    );
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
    expect(v6!.up).toContain(
      "CREATE TABLE IF NOT EXISTS experience_aggregates",
    );
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
      latestVersion: 8,
    };
    expect(status.pending).toEqual([4, 5]);
    expect(status.latestVersion).toBe(8);
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
    expect(MIGRATIONS.length).toBe(12);
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
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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
        {
          version: 6,
          name: "add_experience_feedback_tables",
          applied_at: 6000,
        },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
        { version: 8, name: "add_pipeline_locks", applied_at: 8000 },
        { version: 9, name: "add_trust_scores", applied_at: 9000 },
        { version: 10, name: "add_reddit_posts", applied_at: 10000 },
        { version: 11, name: "add_research_cache_kv", applied_at: 11000 },
        { version: 12, name: "add_nlq_saved_queries", applied_at: 12000 },
      ],
    });

    const result = await initDatabase(mockDb);

    expect(result.success).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.currentVersion).toBe(12);
  });

  it("getMigrationStatus returns current status", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [{ version: 1, name: "initial_schema", applied_at: 1000 }],
    });

    const status = await getMigrationStatus(mockDb);

    expect(status.currentVersion).toBe(1);
    expect(status.applied).toEqual([1]);
    expect(status.pending).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(status.latestVersion).toBe(12);
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
        {
          version: 6,
          name: "add_experience_feedback_tables",
          applied_at: 6000,
        },
        { version: 7, name: "add_auth_tables", applied_at: 7000 },
        { version: 8, name: "add_pipeline_locks", applied_at: 8000 },
        { version: 9, name: "add_trust_scores", applied_at: 9000 },
        { version: 10, name: "add_reddit_posts", applied_at: 10000 },
        { version: 11, name: "add_research_cache_kv", applied_at: 11000 },
        { version: 12, name: "add_nlq_saved_queries", applied_at: 12000 },
      ],
    });

    const status = await getMigrationStatus(mockDb);

    expect(status.pending).toEqual([]);
    expect(status.currentVersion).toBe(12);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
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
      const hasDropOrDropIndex = m.down.includes("DROP");
      expect(hasDropOrDropIndex).toBe(true);
    }
  });
});
