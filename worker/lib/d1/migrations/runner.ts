import type { D1Database } from "@cloudflare/workers-types";
import { createD1Client } from "../client";
import type {
  MigrationRecord,
  MigrationResult,
  MigrationStatus,
} from "./types";
import { MIGRATIONS } from "./schema";

export class MigrationRunner {
  private client: ReturnType<typeof createD1Client>;

  constructor(db: D1Database) {
    this.client = createD1Client(db);
  }

  async getStatus(): Promise<MigrationStatus> {
    await this.ensureMigrationsTable();

    const appliedResult = await this.client.query<MigrationRecord>(
      "SELECT version, name, applied_at FROM schema_migrations ORDER BY version",
    );

    const applied =
      appliedResult.success && appliedResult.data
        ? appliedResult.data.map((r) => r.version)
        : [];

    const allVersions = MIGRATIONS.map((m) => m.version);
    const pending = allVersions.filter((v) => !applied.includes(v));

    const currentVersion = applied.length > 0 ? Math.max(...applied) : 0;

    return {
      currentVersion,
      pending,
      applied,
      latestVersion: Math.max(...allVersions),
    };
  }

  async migrate(targetVersion?: number): Promise<MigrationResult> {
    const status = await this.getStatus();
    const appliedVersions: number[] = [];

    let migrationsToApply = MIGRATIONS.filter(
      (m) => m.version > status.currentVersion,
    );

    if (targetVersion !== undefined) {
      migrationsToApply = migrationsToApply.filter(
        (m) => m.version <= targetVersion,
      );
    }

    // Clean-DB compatibility: migration 7 reads legacy `api_keys` behind a
    // WHERE EXISTS(sqlite_master) guard, but SQLite still raises
    // `no such table` when the table is absent. Ensure an empty legacy stub
    // so fresh local init can proceed; migration 7 drops/renames it to the
    // new schema when it runs.
    if (migrationsToApply.some((m) => m.version === 7)) {
      await this.ensureLegacyApiKeysStub();
    }

    for (const migration of migrationsToApply) {
      try {
        const result = await this.client.raw(migration.up);

        if (!result.success) {
          return {
            success: false,
            applied: appliedVersions,
            rolledBack: [],
            currentVersion: status.currentVersion,
            error: `Migration ${migration.version} (${migration.name}) failed: ${result.error}`,
          };
        }

        await this.client.execute(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, strftime('%s', 'now'))",
          [migration.version, migration.name],
        );

        appliedVersions.push(migration.version);
      } catch (error) {
        return {
          success: false,
          applied: appliedVersions,
          rolledBack: [],
          currentVersion: status.currentVersion,
          error: `Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return {
      success: true,
      applied: appliedVersions,
      rolledBack: [],
      currentVersion:
        appliedVersions.length > 0
          ? Math.max(...appliedVersions)
          : status.currentVersion,
    };
  }

  async rollback(steps: number = 1): Promise<MigrationResult> {
    const status = await this.getStatus();
    const rolledBackVersions: number[] = [];

    const migrationsToRollback = MIGRATIONS.filter((m) =>
      status.applied.includes(m.version),
    )
      .sort((a, b) => b.version - a.version)
      .slice(0, steps);

    for (const migration of migrationsToRollback) {
      try {
        const result = await this.client.raw(migration.down);

        if (!result.success) {
          return {
            success: false,
            applied: [],
            rolledBack: rolledBackVersions,
            currentVersion: status.currentVersion,
            error: `Rollback ${migration.version} failed: ${result.error}`,
          };
        }

        await this.client.execute(
          "DELETE FROM schema_migrations WHERE version = ?",
          [migration.version],
        );

        rolledBackVersions.push(migration.version);
      } catch (error) {
        return {
          success: false,
          applied: [],
          rolledBack: rolledBackVersions,
          currentVersion: status.currentVersion,
          error: `Rollback ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return {
      success: true,
      applied: [],
      rolledBack: rolledBackVersions,
      currentVersion:
        rolledBackVersions.length > 0
          ? (() => {
              const remaining = status.applied.filter(
                (v) => !rolledBackVersions.includes(v),
              );
              return remaining.length > 0 ? Math.max(...remaining) : 0;
            })()
          : status.currentVersion,
    };
  }

  async reset(): Promise<MigrationResult> {
    const status = await this.getStatus();

    if (status.applied.length === 0) {
      return {
        success: true,
        applied: [],
        rolledBack: [],
        currentVersion: 0,
      };
    }

    return this.rollback(status.applied.length);
  }

  async fresh(): Promise<MigrationResult> {
    const resetResult = await this.reset();
    if (!resetResult.success) {
      return resetResult;
    }

    return this.migrate();
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.client.raw(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `);
  }

  private async ensureLegacyApiKeysStub(): Promise<void> {
    await this.client.raw(`
      CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key_hash TEXT NOT NULL UNIQUE,
          user_id TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT,
          last_used_at TEXT,
          is_active INTEGER DEFAULT 1,
          rate_limit_requests_per_minute INTEGER DEFAULT 60,
          rate_limit_requests_per_hour INTEGER DEFAULT 1000,
          metadata TEXT
      );
    `);
  }
}

export function createMigrationRunner(db: D1Database): MigrationRunner {
  return new MigrationRunner(db);
}

export async function initDatabase(db: D1Database): Promise<MigrationResult> {
  const runner = createMigrationRunner(db);
  return runner.migrate();
}

export async function getMigrationStatus(
  db: D1Database,
): Promise<MigrationStatus> {
  const runner = createMigrationRunner(db);
  return runner.getStatus();
}
