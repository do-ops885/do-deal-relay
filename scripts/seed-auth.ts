/**
 * Seed Script for Authentication and User Management
 *
 * Split by blast radius:
 *   - `seedAuth` writes the data authorization actually depends on: the
 *     `roles` and `permissions` rows. Safe to run against production.
 *   - `seedTestFixtures` writes placeholder users with a known hash and a
 *     wildcard API key. Development and tests only; never call it against
 *     production.
 *
 * The role→permission matrix in `role_permissions` is seeded by
 * migrations/0004_refresh_tokens_rbac.sql, which uses the canonical
 * `(id, role, permission, created_at)` columns and `resource:action`
 * vocabulary. Reading `worker/lib/rbac.ts` (`SELECT permission FROM
 * role_permissions WHERE role = ?`) depends on that vocabulary, so this file
 * never invents its own permission names.
 *
 * Every statement is `INSERT OR IGNORE`, so both functions are idempotent.
 */

import { D1Database } from "@cloudflare/workers-types";

/** Permission vocabulary defined by migrations/0004_refresh_tokens_rbac.sql. */
const PERMISSIONS = [
  "deals:read",
  "deals:write",
  "deals:delete",
  "users:read",
  "users:write",
  "users:delete",
  "apikeys:read",
  "apikeys:write",
  "apikeys:delete",
  "audit:read",
  "pipeline:read",
  "pipeline:write",
  "metrics:read",
  "config:read",
  "config:write",
  "referrals:read",
  "referrals:write",
  "profile:read",
  "profile:write",
];

const ROLES = [
  ["admin", "Administrator", "Full system access"],
  ["user", "User", "Standard user access for submissions and research"],
  ["viewer", "Viewer", "Read-only access to deals and referrals"],
  ["api_consumer", "API Consumer", "Limited programmatic access"],
] as const;

const ROLE_ROWS = ROLES.map(
  ([id, name, description]) => `('${id}', '${name}', '${description}')`,
).join(",\n    ");

const PERMISSION_ROWS = PERMISSIONS.map(
  (id) => `('${id}', '${id}', 'Permission ${id}')`,
).join(",\n    ");

const ROLES_AND_PERMISSIONS = [
  `INSERT OR IGNORE INTO roles (id, name, description) VALUES
    ${ROLE_ROWS};`,

  `INSERT OR IGNORE INTO permissions (id, name, description) VALUES
    ${PERMISSION_ROWS};`,
];

/**
 * Placeholder accounts and keys. The password hash is a literal placeholder
 * (`sha256:password123hash`), not a real credential, and the API key grants
 * `["*"]`. These are for local development and tests only.
 */
const TEST_FIXTURES = [
  `INSERT OR IGNORE INTO users (id, email, name, password_hash, role, is_active) VALUES
    ('test-admin-id', 'admin@example.com', 'Test Admin', 'sha256:password123hash', 'admin', 1),
    ('test-user-id', 'user@example.com', 'Test User', 'sha256:password123hash', 'user', 1);`,

  `INSERT OR IGNORE INTO api_keys (id, user_id, key_hash, name, permissions) VALUES
    ('test-key-id', 'test-admin-id', '8edc76949392e276f5713454747ed3e4c49887756f6424e6c1e55047b312385b', 'Admin Test Key', '["*"]');`,
];

async function run(db: D1Database, queries: string[]): Promise<void> {
  for (const query of queries) {
    await db.prepare(query).run();
  }
}

/** Production-safe: roles and permissions only. */
export async function seedAuth(db: D1Database): Promise<void> {
  console.log("Seeding authentication roles and permissions...");
  await run(db, ROLES_AND_PERMISSIONS);
  console.log("Roles and permissions seeded successfully.");
}

/** Development and tests only — creates placeholder users and an API key. */
export async function seedTestFixtures(db: D1Database): Promise<void> {
  console.log("Seeding test users and API key (NOT for production)...");
  await run(db, TEST_FIXTURES);
  console.log("Test fixtures seeded successfully.");
}
